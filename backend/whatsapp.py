import hmac
import json
import os
import re
import threading
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

WAAPI_BASE = 'https://waapi.app/api/v1'
LANGUAGES = {'english', 'roman_urdu'}
ACK_STATUS = {-1: 'failed', 0: 'queued', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read'}
STATUS_RANK = {'queued': 0, 'failed': 0, 'sent': 1, 'delivered': 2, 'read': 3}
OPT_OUT_WORDS = {'stop', 'unsubscribe', 'band', 'band karo'}

TEXT = {
    'attendance_absent': {
        'english': 'Dear {parent}, {student} was marked ABSENT in {class_name} on {date}. Please contact the school if this is unexpected.',
        'roman_urdu': 'Muhtaram {parent}, {student} aaj {date} ko {class_name} mein GHAIR HAZIR tha/thi. Agar ye ghalat hai to school se rabta karein.',
    },
    'attendance_late': {
        'english': 'Dear {parent}, {student} arrived LATE in {class_name} on {date}.',
        'roman_urdu': 'Muhtaram {parent}, {student} {date} ko {class_name} mein DEIR se pohancha/pohanchi.',
    },
    'fee': {
        'english': 'Dear {parent}, this is a reminder that the fee of Rs {amount} for {student} is due by {due}. {note}',
        'roman_urdu': 'Muhtaram {parent}, {student} ki Rs {amount} fee ki akhri tareekh {due} hai. Meherbani karke ada kar dein. {note}',
    },
    'result': {
        'english': 'Dear {parent}, {student} scored {marks}/{total} ({grade}) in {assessment}. {feedback}',
        'roman_urdu': 'Muhtaram {parent}, {student} ne {assessment} mein {marks}/{total} ({grade}) numbers hasil kiye. {feedback}',
    },
    'broadcast': {
        'english': 'Dear {parent}, {message}',
        'roman_urdu': 'Muhtaram {parent}, {message}',
    },
    'sos': {
        'english': 'URGENT NOTICE: {message}',
        'roman_urdu': 'HANGAMI ITTILA: {message}',
    },
    'unknown': {
        'english': 'Sorry, we could not find your number in our records. Please contact the school office.',
        'roman_urdu': 'Maazrat, aap ka number hamare record mein nahi mila. School office se rabta karein.',
    },
    'help': {
        'english': 'Reply ATTENDANCE for recent attendance, RESULT for recent results, FEE for fee info, or STOP to unsubscribe.',
        'roman_urdu': 'ATTENDANCE likhein haziri ke liye, RESULT likhein nataij ke liye, FEE likhein fee ke liye, ya STOP likhein band karne ke liye.',
    },
    'fee_info': {
        'english': 'For fee status and challans please contact the school office.',
        'roman_urdu': 'Fee ki tafseel aur challan ke liye school office se rabta karein.',
    },
    'stopped': {
        'english': 'You have been unsubscribed from school WhatsApp messages.',
        'roman_urdu': 'Aap ke liye school ke WhatsApp paigham band kar diye gaye hain.',
    },
    'no_data': {
        'english': 'No records found yet.',
        'roman_urdu': 'Abhi koi record maujood nahi.',
    },
}


def render(kind, language, **values):
    template = TEXT[kind].get(language) or TEXT[kind]['english']
    clean = {k: ('' if v is None else str(v)) for k, v in values.items()}
    return re.sub(r'\s+', ' ', template.format(**clean)).strip()


def normalize_phone(raw):
    digits = re.sub(r'\D', '', raw or '')
    if digits.startswith('00'):
        digits = digits[2:]
    if digits.startswith('0'):
        digits = '92' + digits[1:]
    if not 10 <= len(digits) <= 15:
        raise ValueError('Enter a valid phone number with country code, e.g. 923001234567.')
    return digits


def configured():
    return bool(os.getenv('WAAPI_TOKEN') and os.getenv('WAAPI_INSTANCE_ID'))


def sandbox_numbers():
    return {normalize_phone(n) for n in os.getenv('WHATSAPP_SANDBOX_NUMBERS', '').split(',') if n.strip()}


def waapi_call(method, path, payload=None):
    request = Request(
        f'{WAAPI_BASE}{path}',
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={'Authorization': f"Bearer {os.getenv('WAAPI_TOKEN')}", 'Accept': 'application/json', 'Content-Type': 'application/json'},
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode() or '{}')
    except HTTPError as err:
        raise RuntimeError(f'WhatsApp provider returned HTTP {err.code}.')
    except (URLError, TimeoutError, ValueError):
        raise RuntimeError('Could not reach the WhatsApp provider.')


def send_text(phone, text):
    """Returns the provider message id. Raises RuntimeError on failure."""
    result = waapi_call('POST', f"/instances/{os.getenv('WAAPI_INSTANCE_ID')}/client/action/send-message", {'chatId': f'{phone}@c.us', 'message': text})
    inner = result.get('data') or {}
    if inner.get('status') != 'success':
        raise RuntimeError((inner.get('message') or 'WhatsApp send failed.')[:200])
    return find_message_id(inner)


def find_message_id(node):
    if isinstance(node, dict):
        ident = node.get('id')
        if isinstance(ident, dict) and ident.get('id'):
            return str(ident['id'])
        for value in node.values():
            found = find_message_id(value)
            if found:
                return found
    return None


def init_whatsapp_tables(c, addcol):
    addcol(c, 'users', 'parent_name', 'TEXT')
    addcol(c, 'users', 'parent_phone', 'TEXT')
    addcol(c, 'users', 'parent_language', "TEXT DEFAULT 'english'")
    addcol(c, 'users', 'parent_optin', 'INTEGER NOT NULL DEFAULT 0')
    c.execute('''CREATE TABLE IF NOT EXISTS whatsapp_messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sent_by INTEGER,
        student_id INTEGER,
        phone TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'out',
        status TEXT NOT NULL DEFAULT 'queued',
        provider_message_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages(id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider ON whatsapp_messages(provider_message_id)')


class GuardianUpdate(BaseModel):
    user_id: int
    student_id: int
    parent_name: str = Field(default='', max_length=120)
    parent_phone: str = Field(default='', max_length=30)
    parent_language: str = 'english'
    parent_optin: bool = False


class TestMessage(BaseModel):
    user_id: int
    phone: str
    message: str = Field(default='Test message from Balochistan Acadmy.', max_length=500)


class AttendanceAlert(BaseModel):
    user_id: int
    class_id: int
    attendance_date: str


class FeeReminder(BaseModel):
    user_id: int
    class_id: int
    student_ids: list[int] = Field(min_length=1, max_length=500)
    amount: int = Field(gt=0, le=10_000_000)
    due_date: str = Field(max_length=40)
    note: str = Field(default='', max_length=200)


class ResultShare(BaseModel):
    user_id: int
    result_id: int


class Broadcast(BaseModel):
    user_id: int
    class_id: int
    message: str = Field(min_length=1, max_length=1000)


class Sos(BaseModel):
    user_id: int
    message: str = Field(min_length=1, max_length=500)
    class_id: Optional[int] = None


def build_whatsapp(db, authenticated_user, teacher_class, verify_premium_access, valid_roles):
    router = APIRouter(prefix='/api/whatsapp', tags=['whatsapp'])
    send_lock = threading.Lock()

    def actor(uid, authorization, roles=('teacher', 'staff')):
        return authenticated_user(uid, authorization, set(roles))

    def check_class_access(account, class_id):
        if account['role'] == 'teacher':
            teacher_class(class_id, account['id'])

    def ensure_ready():
        if not configured():
            raise HTTPException(503, 'WhatsApp is not configured on the server.')

    def daily_count(c):
        today = datetime.now().strftime('%Y-%m-%d')
        row = c.execute("SELECT COUNT(*) n FROM whatsapp_messages WHERE direction='out' AND status<>'blocked' AND created_at>=?", (today,)).fetchone()
        return int(row['n'])

    def queue_messages(account, items, kind):
        """items: list of (student_id, phone, body). Returns (log_ids, skipped_by_limit)."""
        limit = int(os.getenv('WHATSAPP_DAILY_LIMIT', '100'))
        sandbox = sandbox_numbers()
        ids = []
        c = db()
        try:
            used = daily_count(c)
            now = datetime.now().isoformat()
            for student_id, phone, body in items:
                blocked = bool(sandbox) and phone not in sandbox
                over = used >= limit
                status = 'blocked' if blocked else ('failed' if over else 'queued')
                error = 'Number is not in WHATSAPP_SANDBOX_NUMBERS.' if blocked else ('Daily WhatsApp limit reached.' if over else None)
                cur = c.execute(
                    'INSERT INTO whatsapp_messages(sent_by,student_id,phone,kind,body,direction,status,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (account['id'], student_id, phone, kind, body, 'out', status, error, now, now),
                )
                if status == 'queued':
                    ids.append(cur.lastrowid)
                    used += 1
            c.commit()
        finally:
            c.close()
        return ids

    def deliver(log_ids):
        delay = float(os.getenv('WHATSAPP_SEND_DELAY_SECONDS', '5'))
        with send_lock:
            for position, log_id in enumerate(log_ids):
                c = db()
                try:
                    row = c.execute('SELECT phone, body FROM whatsapp_messages WHERE id=?', (log_id,)).fetchone()
                    if not row:
                        continue
                    try:
                        provider_id = send_text(row['phone'], row['body'])
                        c.execute("UPDATE whatsapp_messages SET status='sent', provider_message_id=?, updated_at=? WHERE id=?", (provider_id, datetime.now().isoformat(), log_id))
                    except RuntimeError as err:
                        c.execute("UPDATE whatsapp_messages SET status='failed', error=?, updated_at=? WHERE id=?", (str(err), datetime.now().isoformat(), log_id))
                    c.commit()
                finally:
                    c.close()
                if position < len(log_ids) - 1:
                    time.sleep(delay)

    def guardians_for(c, class_id=None, student_ids=None):
        sql = '''SELECT u.id, u.full_name, u.parent_name, u.parent_phone, u.parent_language FROM users u
                 WHERE u.role='student' AND u.parent_optin=1 AND u.parent_phone IS NOT NULL AND u.parent_phone<>'' '''
        args = []
        if class_id is not None:
            sql += ' AND u.id IN (SELECT student_id FROM enrollments WHERE class_id=?)'
            args.append(class_id)
        if student_ids is not None:
            sql += ' AND u.id IN (%s)' % ','.join('?' * len(student_ids))
            args.extend(student_ids)
        return c.execute(sql, args).fetchall()

    def dispatch(background, account, kind, items):
        if not items:
            raise HTTPException(400, 'No guardians with a saved phone number and WhatsApp consent were found.')
        ids = queue_messages(account, items, kind)
        if ids:
            background.add_task(deliver, ids)
        return {'queued': len(ids), 'skipped': len(items) - len(ids), 'message': f'{len(ids)} message(s) queued. They are sent slowly to protect your WhatsApp number.'}

    @router.get('/status')
    def status(user_id: int, authorization: Optional[str] = Header(None)):
        actor(user_id, authorization)
        info = {'configured': configured(), 'sandbox': bool(sandbox_numbers()), 'daily_limit': int(os.getenv('WHATSAPP_DAILY_LIMIT', '100')), 'connected': False}
        if configured():
            try:
                state = waapi_call('GET', f"/instances/{os.getenv('WAAPI_INSTANCE_ID')}/client/status")
                info['connected'] = (state.get('clientStatus') or {}).get('instanceStatus') == 'ready'
            except RuntimeError:
                pass
        return info

    @router.put('/guardian')
    def set_guardian(x: GuardianUpdate, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        if x.parent_language not in LANGUAGES:
            raise HTTPException(400, 'Language must be english or roman_urdu.')
        phone = ''
        if x.parent_phone.strip():
            try:
                phone = normalize_phone(x.parent_phone)
            except ValueError as err:
                raise HTTPException(400, str(err))
        if x.parent_optin and not phone:
            raise HTTPException(400, 'A phone number is required to enable WhatsApp messages.')
        c = db()
        try:
            student = c.execute("SELECT id FROM users WHERE id=? AND role='student'", (x.student_id,)).fetchone()
            if not student:
                raise HTTPException(404, 'Student not found.')
            if account['role'] == 'teacher' and not c.execute(
                'SELECT 1 FROM enrollments e JOIN classes k ON k.id=e.class_id WHERE e.student_id=? AND k.teacher_id=?', (x.student_id, account['id'])
            ).fetchone():
                raise HTTPException(403, 'This student is not in your classes.')
            c.execute(
                'UPDATE users SET parent_name=?, parent_phone=?, parent_language=?, parent_optin=? WHERE id=?',
                (x.parent_name.strip(), phone, x.parent_language, 1 if x.parent_optin else 0, x.student_id),
            )
            c.commit()
        finally:
            c.close()
        return {'message': 'Guardian details saved.'}

    @router.get('/guardians')
    def list_guardians(user_id: int, class_id: int, authorization: Optional[str] = Header(None)):
        account = actor(user_id, authorization)
        check_class_access(account, class_id)
        c = db()
        try:
            rows = c.execute(
                '''SELECT u.id, u.full_name, u.parent_name, u.parent_phone, u.parent_language, u.parent_optin
                   FROM users u JOIN enrollments e ON e.student_id=u.id WHERE e.class_id=? ORDER BY u.full_name''',
                (class_id,),
            ).fetchall()
        finally:
            c.close()
        return {'students': [dict(r) for r in rows]}

    @router.post('/test')
    def test_message(x: TestMessage, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        ensure_ready()
        try:
            phone = normalize_phone(x.phone)
        except ValueError as err:
            raise HTTPException(400, str(err))
        return dispatch(background, account, 'test', [(None, phone, x.message.strip())])

    @router.post('/attendance-alert')
    def attendance_alert(x: AttendanceAlert, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        ensure_ready()
        check_class_access(account, x.class_id)
        c = db()
        try:
            cls = c.execute('SELECT name FROM classes WHERE id=?', (x.class_id,)).fetchone()
            rows = c.execute(
                '''SELECT u.id, u.full_name, u.parent_name, u.parent_phone, u.parent_language, a.status FROM attendance a
                   JOIN users u ON u.id=a.student_id WHERE a.class_id=? AND a.attendance_date=? AND a.status IN ('absent','late')
                   AND u.parent_optin=1 AND u.parent_phone<>'' ''',
                (x.class_id, x.attendance_date),
            ).fetchall()
        finally:
            c.close()
        items = []
        for r in rows:
            kind = 'attendance_absent' if r['status'] == 'absent' else 'attendance_late'
            body = render(kind, r['parent_language'], parent=r['parent_name'] or 'Parent', student=r['full_name'], class_name=cls['name'], date=x.attendance_date)
            items.append((r['id'], r['parent_phone'], body))
        return dispatch(background, account, 'attendance', items)

    @router.post('/fee-reminder')
    def fee_reminder(x: FeeReminder, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        ensure_ready()
        verify_premium_access(account['id'], 'whatsapp_bulk')
        check_class_access(account, x.class_id)
        c = db()
        try:
            rows = guardians_for(c, class_id=x.class_id, student_ids=x.student_ids)
        finally:
            c.close()
        items = [
            (r['id'], r['parent_phone'], render('fee', r['parent_language'], parent=r['parent_name'] or 'Parent', student=r['full_name'], amount=f'{x.amount:,}', due=x.due_date, note=x.note))
            for r in rows
        ]
        return dispatch(background, account, 'fee', items)

    @router.post('/share-result')
    def share_result(x: ResultShare, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        ensure_ready()
        c = db()
        try:
            r = c.execute(
                '''SELECT r.*, u.full_name, u.parent_name, u.parent_phone, u.parent_language, u.parent_optin FROM results r
                   JOIN users u ON u.id=r.student_id WHERE r.id=?''',
                (x.result_id,),
            ).fetchone()
        finally:
            c.close()
        if not r:
            raise HTTPException(404, 'Result not found.')
        check_class_access(account, r['class_id'])
        if not r['parent_optin'] or not r['parent_phone']:
            raise HTTPException(400, 'This student has no guardian with WhatsApp consent.')
        body = render('result', r['parent_language'], parent=r['parent_name'] or 'Parent', student=r['full_name'], marks=r['marks'], total=r['total_marks'], grade=r['grade'] or '-', assessment=r['assessment_name'], feedback=r['feedback'] or '')
        return dispatch(background, account, 'result', [(r['student_id'], r['parent_phone'], body)])

    @router.post('/broadcast')
    def broadcast(x: Broadcast, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization)
        ensure_ready()
        verify_premium_access(account['id'], 'whatsapp_bulk')
        check_class_access(account, x.class_id)
        c = db()
        try:
            rows = guardians_for(c, class_id=x.class_id)
        finally:
            c.close()
        items = [(r['id'], r['parent_phone'], render('broadcast', r['parent_language'], parent=r['parent_name'] or 'Parent', message=x.message.strip())) for r in rows]
        return dispatch(background, account, 'broadcast', items)

    @router.post('/sos')
    def sos(x: Sos, background: BackgroundTasks, authorization: Optional[str] = Header(None)):
        account = actor(x.user_id, authorization, roles=('staff',))
        ensure_ready()
        c = db()
        try:
            rows = guardians_for(c, class_id=x.class_id)
        finally:
            c.close()
        items = [(r['id'], r['parent_phone'], render('sos', r['parent_language'], message=x.message.strip())) for r in rows]
        return dispatch(background, account, 'sos', items)

    @router.get('/logs')
    def logs(user_id: int, authorization: Optional[str] = Header(None)):
        account = actor(user_id, authorization)
        c = db()
        try:
            if account['role'] == 'staff':
                rows = c.execute('SELECT * FROM whatsapp_messages ORDER BY id DESC LIMIT 100').fetchall()
            else:
                rows = c.execute('SELECT * FROM whatsapp_messages WHERE sent_by=? ORDER BY id DESC LIMIT 100', (account['id'],)).fetchall()
            summary = {}
            for r in rows:
                if r['direction'] == 'out':
                    summary[r['status']] = summary.get(r['status'], 0) + 1
        finally:
            c.close()
        return {'summary': summary, 'messages': [dict(r) for r in rows]}

    def reply_for(c, row_student, text, phone):
        lang = (row_student['parent_language'] if row_student else None) or 'english'
        if not row_student:
            return render('unknown', 'english') + ' / ' + render('unknown', 'roman_urdu')
        word = text.strip().lower()
        if word in OPT_OUT_WORDS:
            c.execute('UPDATE users SET parent_optin=0 WHERE parent_phone=?', (phone,))
            return render('stopped', lang)
        if word.startswith(('attendance', 'haziri', 'hazri')):
            rows = c.execute('SELECT attendance_date, status FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 5', (row_student['id'],)).fetchall()
            return ', '.join(f"{r['attendance_date']}: {r['status']}" for r in rows) if rows else render('no_data', lang)
        if word.startswith(('result', 'nataij', 'natija')):
            rows = c.execute('SELECT assessment_name, marks, total_marks FROM results WHERE student_id=? ORDER BY id DESC LIMIT 3', (row_student['id'],)).fetchall()
            return ', '.join(f"{r['assessment_name']}: {r['marks']}/{r['total_marks']}" for r in rows) if rows else render('no_data', lang)
        if word.startswith('fee'):
            return render('fee_info', lang)
        return render('help', lang)

    @router.post('/webhook/{secret}')
    def webhook(secret: str, payload: dict, background: BackgroundTasks):
        expected = os.getenv('WHATSAPP_WEBHOOK_SECRET', '')
        if not expected or not hmac.compare_digest(secret, expected):
            raise HTTPException(401, 'Invalid webhook secret.')
        event = payload.get('event')
        message = ((payload.get('data') or {}).get('message')) or {}
        if event == 'message_ack':
            provider_id = ((message.get('id') or {}).get('id'))
            new_status = ACK_STATUS.get(message.get('ack'))
            if provider_id and new_status:
                c = db()
                try:
                    row = c.execute("SELECT id, status FROM whatsapp_messages WHERE provider_message_id=? AND direction='out'", (provider_id,)).fetchone()
                    if row and (new_status == 'failed' or STATUS_RANK.get(new_status, 0) > STATUS_RANK.get(row['status'], 0)):
                        c.execute('UPDATE whatsapp_messages SET status=?, updated_at=? WHERE id=?', (new_status, datetime.now().isoformat(), row['id']))
                        c.commit()
                finally:
                    c.close()
        elif event == 'message' and not message.get('fromMe') and message.get('type') == 'chat':
            sender = str(message.get('from') or '')
            text = str(message.get('body') or '')[:500]
            if sender.endswith('@c.us') and text:
                phone = sender.split('@')[0]
                c = db()
                try:
                    student = c.execute("SELECT id, parent_language FROM users WHERE role='student' AND parent_phone=? LIMIT 1", (phone,)).fetchone()
                    now = datetime.now().isoformat()
                    c.execute('INSERT INTO whatsapp_messages(student_id,phone,kind,body,direction,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                              (student['id'] if student else None, phone, 'reply', text, 'in', 'received', now, now))
                    answer = reply_for(c, student, text, phone)
                    c.commit()
                finally:
                    c.close()
                if configured() and not (sandbox_numbers() and phone not in sandbox_numbers()):
                    ids = queue_messages({'id': None}, [(student['id'] if student else None, phone, answer)], 'auto_reply')
                    if ids:
                        background.add_task(deliver, ids)
        return {'ok': True}

    return router
