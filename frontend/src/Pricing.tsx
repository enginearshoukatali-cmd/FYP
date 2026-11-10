import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./apiConfig";

type Plan = { id: string; name: string; price_pkr: number; features: string[] };
type Payment = { method: string; raast_id: string; account_number: string; account_title: string };
type Invoice = { id: number; plan_type: string; months: number; amount_pkr: number; status: string; trx_id?: string | null; admin_note?: string | null; created_at: string };
type BillingStatus = { is_premium: boolean; plan_type: string; subscription_expiry: string | null; expired_plan: string | null; is_admin: boolean; invoices: Invoice[] };
type PendingInvoice = Invoice & { user_id: number; full_name: string; email: string; payer_note?: string | null };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export default function Pricing({ userId, token }: { userId: number; token: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [pending, setPending] = useState<PendingInvoice[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<{ plan: Plan; months: number; invoice: Invoice | null } | null>(null);
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");

  const headers = useCallback((json = false): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  }), [token]);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      const [planData, statusData] = await Promise.all([
        call("/api/billing/plans"),
        call(`/api/billing/status/${userId}`, { headers: headers() }),
      ]);
      setPlans(planData.plans);
      setPayment(planData.payment);
      setStatus(statusData);
      if (statusData.is_admin) {
        const admin = await call(`/api/billing/admin/pending?admin_id=${userId}`, { headers: headers() });
        setPending(admin.invoices);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing.");
    }
  }, [call, headers, userId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const startCheckout = async (plan: Plan, months: number) => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const data = await call("/api/billing/create-invoice", {
        method: "POST", headers: headers(true),
        body: JSON.stringify({ user_id: userId, plan_type: plan.id, months }),
      });
      setPayment(data.payment);
      setTrxId(""); setNote("");
      setCheckout({ plan, months, invoice: data.invoice });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice.");
    } finally { setBusy(false); }
  };

  const submitPayment = async () => {
    if (!checkout?.invoice) return;
    setError(""); setBusy(true);
    try {
      const data = await call("/api/billing/submit-payment", {
        method: "POST", headers: headers(true),
        body: JSON.stringify({ user_id: userId, invoice_id: checkout.invoice.id, trx_id: trxId, note }),
      });
      setNotice(data.message);
      setCheckout(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit payment.");
    } finally { setBusy(false); }
  };

  const review = async (invoiceId: number, approve: boolean) => {
    setError(""); setBusy(true);
    try {
      const data = await call("/api/billing/verify-payment", {
        method: "POST", headers: headers(true),
        body: JSON.stringify({ admin_id: userId, invoice_id: invoiceId, approve }),
      });
      setNotice(data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review payment.");
    } finally { setBusy(false); }
  };

  const current = status?.plan_type || "basic";

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-black text-slate-900">Pricing &amp; Plans</h1>
      <p className="mt-1 text-sm text-slate-500">Upgrade your account to unlock premium features.</p>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      {status && !status.is_premium && (
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 p-4 text-white">
          <p className="font-black">Upgrade to Premium</p>
          <p className="text-sm text-emerald-50">
            {status.expired_plan ? `Your ${status.expired_plan} plan has expired. ` : "You are on the free Basic plan. "}
            Unlock the AI quiz generator and more.
          </p>
        </div>
      )}
      {status?.is_premium && (
        <p className="mt-4 text-sm font-bold text-emerald-700">
          Current plan: {current} · valid until {status.subscription_expiry ? new Date(status.subscription_expiry).toLocaleDateString() : "-"}
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${current === plan.id ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}>
            <h2 className="text-lg font-black text-slate-900">{plan.name}</h2>
            <p className="mt-1 text-3xl font-black text-slate-900">{plan.price_pkr === 0 ? "Free" : `Rs ${plan.price_pkr.toLocaleString()}`}{plan.price_pkr > 0 && <span className="text-sm font-semibold text-slate-400"> /month</span>}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
            </ul>
            {plan.price_pkr > 0 && (
              <button type="button" disabled={busy || current === plan.id} onClick={() => void startCheckout(plan, 1)} className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                {current === plan.id ? "Current plan" : `Upgrade to ${plan.name}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {checkout?.invoice && payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-black">Pay for {checkout.plan.name}</h2>
            <label className="mt-3 block text-xs font-bold text-slate-500">Months
              <select value={checkout.months} disabled className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option>{checkout.months}</option></select>
            </label>
            <p className="mt-3 text-sm">Amount: <b>Rs {checkout.invoice.amount_pkr.toLocaleString()}</b> · Invoice #{checkout.invoice.id}</p>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold">{payment.method}</p>
              <p>Raast ID: <b>{payment.raast_id}</b></p>
              <p>Number: <b>{payment.account_number}</b></p>
              <p>Account title: <b>{payment.account_title}</b></p>
            </div>
            <p className="mt-3 text-xs text-slate-500">Send the amount, then enter the transaction ID from your payment receipt. Your plan activates after verification.</p>
            <input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="Transaction ID (TRX ID)" className="mt-3 w-full rounded-lg border border-slate-200 p-2.5 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={300} className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-sm" />
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy || trxId.trim().length < 6} onClick={() => void submitPayment()} className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Submit for verification</button>
              <button type="button" onClick={() => setCheckout(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {status && status.invoices.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-black">Your payments</h2>
          <div className="mt-2 divide-y rounded-2xl border border-slate-200 bg-white">
            {status.invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>#{invoice.id} · {invoice.plan_type} · {invoice.months} mo · Rs {invoice.amount_pkr.toLocaleString()}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[invoice.status] || ""}`}>{invoice.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {status?.is_admin && (
        <section className="mt-8">
          <h2 className="text-lg font-black">Payments awaiting verification</h2>
          {pending.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing pending.</p> : (
            <div className="mt-2 divide-y rounded-2xl border border-slate-200 bg-white">
              {pending.map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span><b>{invoice.full_name}</b> ({invoice.email}) · {invoice.plan_type} · {invoice.months} mo · Rs {invoice.amount_pkr.toLocaleString()} · TRX <b>{invoice.trx_id}</b></span>
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void review(invoice.id, true)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Approve</button>
                    <button type="button" disabled={busy} onClick={() => void review(invoice.id, false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700">Reject</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
