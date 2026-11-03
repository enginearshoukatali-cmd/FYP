import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./apiConfig";

type Role = "teacher" | "staff";
type ClassItem = { id: number; name: string };
type Student = { id: number; full_name: string; parent_name: string | null; parent_phone: string | null; parent_language: string | null; parent_optin: number };
type LogItem = { id: number; phone: string; kind: string; body: string; direction: string; status: string; error: string | null; created_at: string };
type WaStatus = { configured: boolean; connected: boolean; sandbox: boolean; daily_limit: number };

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  sent: "bg-blue-50 text-blue-700",
  delivered: "bg-indigo-50 text-indigo-700",
  read: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  blocked: "bg-amber-50 text-amber-700",
  received: "bg-purple-50 text-purple-700",
};

export default function WhatsAppCenter({ userId, token, role }: { userId: number; token: string; role: Role }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [wa, setWa] = useState<WaStatus | null>(null);
  const [message, setMessage] = useState("");
  const [sosText, setSosText] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const auth = useCallback((json = false): Record<string, string> => ({ Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) }), [token]);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
    return data;
  }, []);

  const loadLogs = useCallback(async () => {
    const data = await call(`/api/whatsapp/logs?user_id=${userId}`, { headers: auth() });
    setLogs(data.messages);
    setSummary(data.summary);
  }, [auth, call, userId]);

  const loadStudents = useCallback(async (id: string) => {
    if (!id) { setStudents([]); return; }
    const data = await call(`/api/whatsapp/guardians?user_id=${userId}&class_id=${id}`, { headers: auth() });
    setStudents(data.students);
  }, [auth, call, userId]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const classPath = role === "staff" ? `/api/classes/all?requester_id=${userId}` : `/api/classes/teacher/${userId}`;
        const [list, state] = await Promise.all([
          call(classPath, { headers: auth() }),
          call(`/api/whatsapp/status?user_id=${userId}`, { headers: auth() }),
          loadLogs(),
        ]);
        setClasses(list);
        setWa(state);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load WhatsApp tools.");
      }
    });
  }, [auth, call, loadLogs, role, userId]);

  const run = async (action: () => Promise<{ message?: string } | void>) => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const result = await action();
      if (result?.message) setNotice(result.message);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally { setBusy(false); }
  };

  const post = (path: string, body: Record<string, unknown>) => call(path, { method: "POST", headers: auth(true), body: JSON.stringify({ user_id: userId, ...body }) });

  const saveGuardian = (student: Student) => run(async () => {
    const data = await call("/api/whatsapp/guardian", {
      method: "PUT", headers: auth(true),
      body: JSON.stringify({ user_id: userId, student_id: student.id, parent_name: student.parent_name || "", parent_phone: student.parent_phone || "", parent_language: student.parent_language || "english", parent_optin: !!student.parent_optin }),
    });
    await loadStudents(classId);
    return data;
  });

  const patchStudent = (id: number, patch: Partial<Student>) => setStudents((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-black text-slate-900">WhatsApp for Parents</h1>
      <p className="mt-1 text-sm text-slate-500">Messages go only to guardians who gave consent. Sending is slow on purpose to protect your number.</p>

      {wa && (
        <p className={`mt-3 text-sm font-bold ${wa.connected ? "text-emerald-700" : "text-red-600"}`}>
          {!wa.configured ? "WhatsApp is not configured on the server." : wa.connected ? "WhatsApp connected" : "WhatsApp disconnected – scan the QR code in WaAPI."}
          {wa.sandbox && " · Test mode (only allowed numbers)"}
        </p>
      )}
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-black">Classroom</h2>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); void loadStudents(e.target.value).catch((err) => setError(err.message)); }} className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm">
          <option value="">Select a classroom</option>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>

        {classId && (
          <>
            <div className="mt-4 space-y-3">
              {students.map((s) => (
                <div key={s.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-center">
                  <span className="text-sm font-bold">{s.full_name}</span>
                  <input value={s.parent_name || ""} onChange={(e) => patchStudent(s.id, { parent_name: e.target.value })} placeholder="Parent name" className="rounded-lg border border-slate-200 p-2 text-sm" />
                  <input value={s.parent_phone || ""} onChange={(e) => patchStudent(s.id, { parent_phone: e.target.value })} placeholder="03XX XXXXXXX" className="rounded-lg border border-slate-200 p-2 text-sm" />
                  <select value={s.parent_language || "english"} onChange={(e) => patchStudent(s.id, { parent_language: e.target.value })} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <option value="english">English</option>
                    <option value="roman_urdu">Roman Urdu</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!s.parent_optin} onChange={(e) => patchStudent(s.id, { parent_optin: e.target.checked ? 1 : 0 })} />Consent</label>
                  <button type="button" disabled={busy} onClick={() => void saveGuardian(s)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white sm:col-span-5 sm:justify-self-end">Save</button>
                </div>
              ))}
              {students.length === 0 && <p className="text-sm text-slate-500">No students in this classroom.</p>}
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-500">Attendance date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 p-2 text-sm" />
              </label>
              <button type="button" disabled={busy} onClick={() => void run(() => post("/api/whatsapp/attendance-alert", { class_id: Number(classId), attendance_date: date }))} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Send absent/late alerts</button>
            </div>

            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} placeholder="Announcement for all parents in this class" className="mt-4 w-full rounded-lg border border-slate-200 p-2 text-sm" />
            <button type="button" disabled={busy || !message.trim()} onClick={() => void run(async () => { const r = await post("/api/whatsapp/broadcast", { class_id: Number(classId), message }); setMessage(""); return r; })} className="mt-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Send announcement</button>
          </>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-black">Send a test message</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your own number, e.g. 03XX XXXXXXX" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm" />
          <button type="button" disabled={busy || !testPhone.trim()} onClick={() => void run(() => post("/api/whatsapp/test", { phone: testPhone }))} className="rounded-xl border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50">Send test</button>
        </div>
      </section>

      {role === "staff" && (
        <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-black text-red-800">Emergency SOS broadcast</h2>
          <p className="text-xs text-red-700">Goes to every guardian with consent (or only the selected classroom).</p>
          <textarea value={sosText} onChange={(e) => setSosText(e.target.value)} maxLength={500} rows={2} placeholder="e.g. School is closed tomorrow due to heavy rain." className="mt-2 w-full rounded-lg border border-red-200 p-2 text-sm" />
          <button type="button" disabled={busy || !sosText.trim()} onClick={() => { if (window.confirm("Send this emergency message to all parents now?")) void run(async () => { const r = await post("/api/whatsapp/sos", { message: sosText, class_id: classId ? Number(classId) : null }); setSosText(""); return r; }); }} className="mt-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Send SOS</button>
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Delivery log</h2>
          <button type="button" onClick={() => void loadLogs()} className="text-xs font-bold text-emerald-700">Refresh</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No messages yet."}</p>
        <div className="mt-2 divide-y rounded-2xl border border-slate-200 bg-white">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 flex-1"><b>{log.direction === "in" ? "←" : "→"} {log.phone}</b> · {log.kind}<br /><span className="break-words text-slate-500">{log.body}</span>{log.error && <><br /><span className="text-xs text-red-600">{log.error}</span></>}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[log.status] || ""}`}>{log.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
