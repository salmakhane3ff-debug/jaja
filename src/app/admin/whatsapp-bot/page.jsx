"use client";

/**
 * /admin/whatsapp-bot — WhatsApp bot admin panel (Phase 4c).
 * Connection, controls (start/stop/restart/reconnect/logout), templates,
 * send-test, statistics, and leveled logs. All actions proxy to the bot's
 * localhost control API; this page never imports whatsapp-web.js.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare, RefreshCw, Wifi, WifiOff, QrCode, AlertTriangle,
  Play, Square, RotateCw, Plug, LogOut, Send, Save, Trash2,
  Maximize2, Download,
} from "lucide-react";

const TEMPLATE_KEYS = [
  { key: "NEW",       label: "Pending / New" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "SHIPPED",   label: "Shipped" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "CANCELLED", label: "Cancelled" },
];

const STATE_LABELS = {
  ready:         { label: "Connected",        cls: "bg-green-100 text-green-700" },
  qr:            { label: "Awaiting QR scan", cls: "bg-amber-100 text-amber-700" },
  authenticated: { label: "Authenticating…",  cls: "bg-blue-100 text-blue-700"   },
  starting:      { label: "Connecting…",       cls: "bg-blue-100 text-blue-700"   },
  auth_failure:  { label: "Auth failed",       cls: "bg-red-100 text-red-700"     },
  disconnected:  { label: "Disconnected",      cls: "bg-red-100 text-red-700"     },
  offline:       { label: "Bot offline",       cls: "bg-gray-100 text-gray-500"   },
  unconfigured:  { label: "Not configured",    cls: "bg-gray-100 text-gray-500"   },
  error:         { label: "Error",             cls: "bg-red-100 text-red-700"     },
};

const LOG_LEVELS = ["INFO", "WARNING", "ERROR"];

function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">{title}</p>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-center">
      <p className="text-xl font-black text-gray-900">{value ?? "—"}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function WhatsAppBotPage() {
  const [status, setStatus] = useState(null);
  const [qr,     setQr]     = useState(null);
  const [logs,   setLogs]   = useState([]);
  const [stats,  setStats]  = useState(null);
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState({ NEW: "", CONFIRMED: "", SHIPPED: "", DELIVERED: "", CANCELLED: "" });
  const [abandonedTemplate, setAbandonedTemplate] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplMsg, setTplMsg] = useState(null);

  const [testPhone, setTestPhone] = useState("");
  const [testTpl,   setTestTpl]   = useState("NEW");
  const [testCustom, setTestCustom] = useState("");
  const [sending, setSending] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  const [testDiag, setTestDiag] = useState(null);

  const [logFilter, setLogFilter] = useState("ALL");
  const [busyAction, setBusyAction] = useState(null);
  const [qrFull, setQrFull] = useState(false);
  const tplLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, q, l, st] = await Promise.all([
        fetch("/api/admin/whatsapp-bot/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/whatsapp-bot/qr",     { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/whatsapp-bot/logs",   { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/whatsapp-bot/stats",  { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setStatus(s);
      setQr(q);
      setLogs(Array.isArray(l?.logs) ? l.logs : []);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    const d = await fetch("/api/admin/whatsapp-bot/templates", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.templates) {
      setTemplates((prev) => ({ ...prev, ...d.templates }));
      if (typeof d.abandonedTemplate === "string") setAbandonedTemplate(d.abandonedTemplate);
      tplLoaded.current = true;
    }
  }, []);

  useEffect(() => {
    refresh();
    loadTemplates();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh, loadTemplates]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const runAction = async (action, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyAction(action);
    try {
      await fetch("/api/admin/whatsapp-bot/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } finally {
      setBusyAction(null);
    }
  };

  const saveTemplates = async () => {
    setSavingTpl(true); setTplMsg(null);
    try {
      const r = await fetch("/api/admin/whatsapp-bot/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates, abandonedTemplate }),
      });
      setTplMsg(r.ok ? { ok: true, text: "Templates saved" } : { ok: false, text: "Save failed" });
    } catch {
      setTplMsg({ ok: false, text: "Network error" });
    } finally {
      setSavingTpl(false);
      setTimeout(() => setTplMsg(null), 3000);
    }
  };

  const sendTest = async () => {
    setSending(true); setTestMsg(null); setTestDiag(null);
    const message = testCustom.trim() || templates[testTpl] || "";
    try {
      const r = await fetch("/api/admin/whatsapp-bot/send-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone, message }),
      });
      const d = await r.json().catch(() => ({}));
      setTestMsg(d.ok
        ? { ok: true,  text: `Sent + verified to ${d.phone || testPhone}${d.messageId ? ` (id ${d.messageId})` : ""}` }
        : { ok: false, text: d.error || "Send failed" });
      setTestDiag(d.diagnostics || null);
      await refresh();
    } catch {
      setTestMsg({ ok: false, text: "Network error" });
    } finally {
      setSending(false);
    }
  };

  const state = status?.state || "offline";
  const badge = STATE_LABELS[state] || STATE_LABELS.offline;
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter((l) => l.level === logFilter);
  const connected = state === "ready";

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5" dir="ltr">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={20} className="text-green-600" /> WhatsApp Bot
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage the order-notification bot.</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Connection */}
      <Card title="Connection">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
            {connected ? <Wifi size={12} /> : state === "qr" ? <QrCode size={12} /> : <WifiOff size={12} />}
            {badge.label}
          </span>
          {status?.number && <span className="text-xs text-gray-600 font-mono">+{status.number}</span>}
          {status?.connectedSince && <span className="text-xs text-gray-400">connected {new Date(status.connectedSince).toLocaleString()}</span>}
          {status?.lastActivity && <span className="text-xs text-gray-400">last activity {new Date(status.lastActivity).toLocaleTimeString()}</span>}
          {status?.lastError && <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{status.lastError}</span>}
        </div>

        {(state === "offline" || state === "unconfigured") && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            {state === "unconfigured"
              ? "Control API not configured. Set WA_BOT_CONTROL_TOKEN and run the bot with --send on the same host."
              : "Bot process not reachable. Start it: node scripts/whatsapp-order-bot.js --send (under PM2)."}
          </div>
        )}
      </Card>

      {/* Controls */}
      <Card title="Controls">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runAction("start")} disabled={busyAction} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
            <Play size={14} /> Start
          </button>
          <button onClick={() => runAction("stop", "Stop the WhatsApp bot? It will stop sending until started again.")} disabled={busyAction} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
            <Square size={14} /> Stop
          </button>
          <button onClick={() => runAction("restart", "Restart the WhatsApp bot connection?")} disabled={busyAction} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            <RotateCw size={14} /> Restart
          </button>
          <button onClick={() => runAction("reconnect")} disabled={busyAction} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            <Plug size={14} /> Reconnect
          </button>
          <button onClick={() => runAction("logout", "Log out the WhatsApp session and DELETE the saved login? You will need to scan the QR again.")} disabled={busyAction} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
            <LogOut size={14} /> Logout (delete session)
          </button>
        </div>
      </Card>

      {/* QR */}
      {state === "qr" && (qr?.dataUrl || qr?.ascii) && (
        <Card
          title="Scan this QR in WhatsApp → Linked Devices"
          right={qr?.dataUrl && (
            <div className="flex items-center gap-2">
              <button onClick={() => setQrFull(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                <Maximize2 size={12} /> Fullscreen
              </button>
              <a href={qr.dataUrl} download="whatsapp-qr.png" className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                <Download size={12} /> Download
              </a>
            </div>
          )}
        >
          {qr.dataUrl ? (
            <img src={qr.dataUrl} alt="WhatsApp QR" width={350} height={350} className="rounded-lg border border-gray-100" />
          ) : (
            <pre className="text-[6px] leading-[6px] font-mono bg-white text-black overflow-auto">{qr.ascii}</pre>
          )}
        </Card>
      )}

      {/* Fullscreen QR overlay */}
      {qrFull && qr?.dataUrl && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setQrFull(false)}>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img src={qr.dataUrl} alt="WhatsApp QR" className="w-[80vmin] h-[80vmin] max-w-[560px] max-h-[560px]" />
            <button onClick={() => setQrFull(false)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-gray-900 text-white hover:bg-gray-800">Close</button>
          </div>
        </div>
      )}

      {/* Statistics */}
      <Card title="Statistics">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label="Sent today"    value={stats?.sentToday} />
          <Stat label="Sent this week" value={stats?.sentWeek} />
          <Stat label="Pending queue" value={stats?.pending} />
          <Stat label="Failed sends"  value={stats?.failed} />
        </div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Last 100 messages</p>
        <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-gray-400">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(stats?.lastMessages || []).length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No messages yet.</td></tr>
              ) : (
                stats.lastMessages.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(m.ts).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{String(m.orderId).slice(0, 8)}</td>
                    <td className="px-3 py-2 text-gray-700">{m.state}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{m.phone}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${m.result === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.result}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Templates */}
      <Card
        title="Message Templates"
        right={
          <button onClick={saveTemplates} disabled={savingTpl} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50">
            <Save size={13} /> {savingTpl ? "Saving…" : "Save"}
          </button>
        }
      >
        <p className="text-xs text-gray-400 mb-3">
          Variables: <code>{"{name}"}</code>, <code>{"{products}"}</code>, <code>{"{total}"}</code>, <code>{"{shipping}"}</code>, <code>{"{payment}"}</code>, <code>{"{status}"}</code>, <code>{"{orderId}"}</code>
        </p>
        <div className="space-y-3">
          {TEMPLATE_KEYS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
              <textarea
                rows={6}
                value={templates[key] ?? ""}
                onChange={(e) => setTemplates((p) => ({ ...p, [key]: e.target.value }))}
                dir="auto"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
              />
            </div>
          ))}

          {/* Abandoned cart — a fully separate reminder (never says "order received"). */}
          <div className="pt-3 mt-1 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Abandoned Cart Reminder
              <span className="ml-2 font-normal text-gray-400">— separate workflow, sent 30 min after a cart is left</span>
            </label>
            <p className="text-xs text-gray-400 mb-1">
              Variables: <code>{"{name}"}</code>, <code>{"{products}"}</code>, <code>{"{total}"}</code>, <code>{"{shipping}"}</code>, <code>{"{checkoutLink}"}</code>
            </p>
            <textarea
              rows={7}
              value={abandonedTemplate}
              onChange={(e) => setAbandonedTemplate(e.target.value)}
              dir="auto"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
            />
          </div>
        </div>
        {tplMsg && <p className={`text-xs mt-2 ${tplMsg.ok ? "text-green-600" : "text-red-500"}`}>{tplMsg.text}</p>}
      </Card>

      {/* Send Test */}
      <Card title="Send Test Message">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone (Moroccan)</label>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0612345678" dir="ltr"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
            <select value={testTpl} onChange={(e) => setTestTpl(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400">
              {TEMPLATE_KEYS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Custom message (optional — overrides the template)</label>
          <textarea rows={2} value={testCustom} onChange={(e) => setTestCustom(e.target.value)} dir="auto"
            placeholder={templates[testTpl] || ""}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={sendTest} disabled={sending || !connected || !testPhone.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            <Send size={14} /> {sending ? "Sending…" : "Send test"}
          </button>
          {!connected && <span className="text-xs text-gray-400">Bot must be connected to send.</span>}
          {testMsg && <span className={`text-xs ${testMsg.ok ? "text-green-600" : "text-red-500"}`}>{testMsg.text}</span>}
        </div>
        {testDiag && (
          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">Delivery diagnostics</p>
            <pre className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap overflow-auto max-h-72">{JSON.stringify(testDiag, null, 2)}</pre>
          </div>
        )}
      </Card>

      {/* Logs */}
      <Card
        title="Logs"
        right={
          <div className="flex items-center gap-2">
            <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
              <option value="ALL">All</option>
              {LOG_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>
            <button onClick={() => runAction("clear-logs", "Clear the bot logs?")} disabled={busyAction}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
              <Trash2 size={12} /> Clear
            </button>
          </div>
        }
      >
        {filteredLogs.length === 0 ? (
          <p className="text-xs text-gray-400">No logs.</p>
        ) : (
          <pre className="text-[11px] leading-relaxed font-mono text-gray-700 bg-gray-50 rounded-xl border border-gray-100 p-3 max-h-96 overflow-auto whitespace-pre-wrap">
            {filteredLogs.map((l) => l.msg).join("\n")}
          </pre>
        )}
      </Card>
    </div>
  );
}
