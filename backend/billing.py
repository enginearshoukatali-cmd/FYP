import os
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

PLANS = {
    'basic': {'name': 'Basic', 'price_pkr': 0, 'features': ['Classes, quizzes and assignments', 'AI study assistant', 'Curriculum reader']},
    'advanced': {'name': 'Advanced', 'price_pkr': 1500, 'features': ['Everything in Basic', 'AI quiz and paper generator', 'Bulk WhatsApp broadcasts', 'Priority support']},
    'enterprise': {'name': 'Enterprise', 'price_pkr': 5000, 'features': ['Everything in Advanced', 'Automated reminders and scheduling', 'Voice notes and emergency alerts', 'Dedicated onboarding']},
}
PLAN_RANK = {'basic': 0, 'advanced': 1, 'enterprise': 2}
FEATURE_MIN_PLAN = {
    'ai_quiz_generator': 'advanced',
    'whatsapp_bulk': 'advanced',
    'whatsapp_automation': 'enterprise',
    'voice_notes': 'enterprise',
}
TRX_PATTERN = re.compile(r'^[A-Za-z0-9\-]{6,40}$')


def payment_details():
    return {
        'method': 'NayaPay / Raast',
        'raast_id': os.getenv('RAAST_ID', 'shoukat.ali786@nayapay'),
        'account_number': os.getenv('RAAST_ACCOUNT_NUMBER', '+923375213677'),
        'account_title': os.getenv('RAAST_ACCOUNT_TITLE', 'Shoukat Ali'),
    }


def enforcement_enabled():
    return os.getenv('BILLING_ENFORCE', 'false').strip().lower() in {'1', 'true', 'yes'}


def admin_emails():
    return {e.strip().lower() for e in os.getenv('ADMIN_EMAILS', '').split(',') if e.strip()}


def init_billing_tables(c, addcol):
    addcol(c, 'users', 'plan_type', "TEXT DEFAULT 'basic'")
    addcol(c, 'users', 'subscription_expiry', 'TEXT')
    c.execute('''CREATE TABLE IF NOT EXISTS billing_invoices(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_type TEXT NOT NULL,
        months INTEGER NOT NULL DEFAULT 1,
        amount_pkr INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        trx_id TEXT,
        payer_note TEXT,
        admin_note TEXT,
        reviewed_by INTEGER,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        reviewed_at TEXT
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices(user_id,id)')
    # A transaction id can fund only one non-rejected invoice.
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_trx_unique ON billing_invoices(trx_id) WHERE trx_id IS NOT NULL AND status<>'rejected'")


class InvoiceCreate(BaseModel):
    user_id: int
    plan_type: str
    months: int = Field(default=1, ge=1, le=12)


class PaymentSubmit(BaseModel):
    user_id: int
    invoice_id: int
    trx_id: str
    note: str = Field(default='', max_length=300)


class PaymentReview(BaseModel):
    admin_id: int
    invoice_id: int
    approve: bool
    note: str = Field(default='', max_length=300)


def build_billing(db, authenticated_user, valid_roles):
    router = APIRouter(prefix='/api/billing', tags=['billing'])

    def subscription_state(row):
        plan = (row['plan_type'] or 'basic') if row else 'basic'
        expiry = row['subscription_expiry'] if row else None
        active = False
        if plan in PLAN_RANK and plan != 'basic' and expiry:
            try:
                active = datetime.fromisoformat(expiry) > datetime.now()
            except ValueError:
                active = False
        effective = plan if active else 'basic'
        return {
            'is_premium': active,
            'plan_type': effective,
            'subscription_expiry': expiry if active else None,
            'expired_plan': plan if (not active and plan != 'basic') else None,
        }

    def status_for(uid):
        c = db()
        try:
            row = c.execute('SELECT plan_type, subscription_expiry FROM users WHERE id=?', (uid,)).fetchone()
        finally:
            c.close()
        return subscription_state(row)

    def is_admin(account):
        return (account['email'] or '').lower() in admin_emails()

    def require_admin(admin_id, authorization):
        account = authenticated_user(admin_id, authorization, valid_roles)
        if not is_admin(account):
            raise HTTPException(403, 'Admin access required.')
        return account

    @router.get('/plans')
    def plans():
        return {
            'plans': [{'id': key, **value} for key, value in PLANS.items()],
            'payment': payment_details(),
            'enforced': enforcement_enabled(),
        }

    @router.get('/status/{user_id}')
    def status(user_id: int, authorization: Optional[str] = Header(None)):
        account = authenticated_user(user_id, authorization, valid_roles)
        c = db()
        try:
            invoices = c.execute(
                'SELECT id, plan_type, months, amount_pkr, status, trx_id, admin_note, created_at FROM billing_invoices WHERE user_id=? ORDER BY id DESC LIMIT 20',
                (user_id,),
            ).fetchall()
        finally:
            c.close()
        return {**status_for(user_id), 'is_admin': is_admin(account), 'invoices': [dict(i) for i in invoices]}

    @router.post('/create-invoice')
    def create_invoice(x: InvoiceCreate, authorization: Optional[str] = Header(None)):
        authenticated_user(x.user_id, authorization, valid_roles)
        plan = PLANS.get(x.plan_type)
        if not plan or x.plan_type == 'basic':
            raise HTTPException(400, 'Choose a paid plan (advanced or enterprise).')
        c = db()
        try:
            cur = c.execute(
                'INSERT INTO billing_invoices(user_id,plan_type,months,amount_pkr,status,created_at) VALUES(?,?,?,?,?,?)',
                (x.user_id, x.plan_type, x.months, plan['price_pkr'] * x.months, 'pending', datetime.now().isoformat()),
            )
            invoice = c.execute('SELECT * FROM billing_invoices WHERE id=?', (cur.lastrowid,)).fetchone()
            c.commit()
        finally:
            c.close()
        return {'invoice': dict(invoice), 'payment': payment_details()}

    @router.post('/submit-payment')
    def submit_payment(x: PaymentSubmit, authorization: Optional[str] = Header(None)):
        authenticated_user(x.user_id, authorization, valid_roles)
        trx = x.trx_id.strip()
        if not TRX_PATTERN.match(trx):
            raise HTTPException(400, 'Enter a valid transaction ID (6-40 letters, digits or dashes).')
        c = db()
        try:
            inv = c.execute('SELECT * FROM billing_invoices WHERE id=? AND user_id=?', (x.invoice_id, x.user_id)).fetchone()
            if not inv:
                raise HTTPException(404, 'Invoice not found.')
            if inv['status'] not in ('pending', 'rejected'):
                raise HTTPException(409, 'This invoice has already been submitted.')
            dup = c.execute("SELECT 1 FROM billing_invoices WHERE trx_id=? AND status<>'rejected' AND id<>?", (trx, x.invoice_id)).fetchone()
            if dup:
                raise HTTPException(409, 'This transaction ID has already been used.')
            c.execute(
                "UPDATE billing_invoices SET trx_id=?, payer_note=?, status='submitted', submitted_at=? WHERE id=?",
                (trx, x.note.strip(), datetime.now().isoformat(), x.invoice_id),
            )
            c.commit()
        finally:
            c.close()
        return {'message': 'Payment submitted. It will be activated after verification.'}

    @router.get('/admin/pending')
    def admin_pending(admin_id: int, authorization: Optional[str] = Header(None)):
        require_admin(admin_id, authorization)
        c = db()
        try:
            rows = c.execute(
                '''SELECT i.*, u.full_name, u.email FROM billing_invoices i JOIN users u ON u.id=i.user_id
                   WHERE i.status='submitted' ORDER BY i.id''',
            ).fetchall()
        finally:
            c.close()
        return {'invoices': [dict(r) for r in rows]}

    @router.post('/verify-payment')
    def verify_payment(x: PaymentReview, authorization: Optional[str] = Header(None)):
        require_admin(x.admin_id, authorization)
        c = db()
        try:
            inv = c.execute('SELECT * FROM billing_invoices WHERE id=?', (x.invoice_id,)).fetchone()
            if not inv:
                raise HTTPException(404, 'Invoice not found.')
            if inv['status'] != 'submitted':
                raise HTTPException(409, 'Only submitted invoices can be reviewed.')
            now = datetime.now()
            if x.approve:
                u = c.execute('SELECT plan_type, subscription_expiry FROM users WHERE id=?', (inv['user_id'],)).fetchone()
                base = now
                if u and u['subscription_expiry'] and (u['plan_type'] or 'basic') == inv['plan_type']:
                    try:
                        current = datetime.fromisoformat(u['subscription_expiry'])
                        if current > now:
                            base = current
                    except ValueError:
                        pass
                expiry = base + timedelta(days=30 * int(inv['months']))
                c.execute('UPDATE users SET plan_type=?, subscription_expiry=? WHERE id=?', (inv['plan_type'], expiry.isoformat(), inv['user_id']))
            c.execute(
                'UPDATE billing_invoices SET status=?, admin_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
                ('approved' if x.approve else 'rejected', x.note.strip(), x.admin_id, now.isoformat(), x.invoice_id),
            )
            c.commit()
        finally:
            c.close()
        return {'message': 'Payment approved and plan activated.' if x.approve else 'Payment rejected.'}

    def verify_premium_access(uid, feature):
        """Raise 402 when billing enforcement is on and the user's plan lacks the feature."""
        if not enforcement_enabled():
            return
        needed = FEATURE_MIN_PLAN.get(feature, 'advanced')
        state = status_for(uid)
        if PLAN_RANK.get(state['plan_type'], 0) < PLAN_RANK[needed]:
            raise HTTPException(402, f'This feature needs the {PLANS[needed]["name"]} plan. Upgrade from the Pricing page.')

    return router, verify_premium_access
