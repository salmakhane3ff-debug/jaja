"use client";

/**
 * /admin/whatsapp-bot — read-only WhatsApp bot panel (Phase 4b).
 * Shows connection status, the QR (while awaiting scan), and recent logs.
 * No message-sending, no start/stop/restart, no template editing (later phases).
 */

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, RefreshCw, Wifi, WifiOff, QrCode, AlertTriangle } from "lucide-react";

const STATE_LABELS = {
  ready:         { label: "Connected",       cls: "bg-green-100 text-green-700" },
  qr:            { label: "Awaiting QR scan", cls: "bg-amber-100 text-amber-700" },
  authenticated: { label: "Authenticating…",  cls: "bg-blue-100 text-blue-700"   },
  starting:      { label: "Starting…",         cls: "bg-gray-100 text-gray-600"   },
  auth_failure:  { label: "Auth failed",       cls: "bg-red-100 text-red-700"     },
  disconnected:  { label: "Disconnected",      cls: "bg-red-100 text-red-700"     },
  offline:       { label: "Bot offline",       cls: "bg-gray-100 text-gray-500"   },
  unconfigured:  { label: "Not configured",    cls: "bg-gray-100 text-gray-500"   },
  error:         { label: "Error",             cls: "bg-red-100 text-red-700"     },
};

export default function WhatsAppBotPage() {
  const [status, setStatus] = useState(null);
  const [qr,     setQr]     = useState(null);
  const [logs,   setLogs]   = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, q, l] = await Promise.all([
        fetch("/api/admin/whatsapp-bot/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/whatsapp-bot/qr",     { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/whatsapp-bot/logs",   { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setStatus(s);
      setQr(q);
      setLogs(Array.isArray(l?.logs) ? l.logs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const state = status?.state || "offline";
  const badge = STATE_LABELS[state] || STATE_LABELS.offline;

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5" dir="ltr">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={20} className="text-green-600" /> WhatsApp Bot
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Read-only status, QR, and logs for the order-notification bot.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Connection status */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
          {state === "ready" ? <Wifi size={12} /> : state === "qr" ? <QrCode size={12} /> : <WifiOff size={12} />}
          {badge.label}
        </span>
        {status?.since && (
          <span className="text-xs text-gray-400">since {new Date(status.since).toLocaleString()}</span>
        )}
        {status?.lastError && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} /> {status.lastError}
          </span>
        )}
      </div>

      {/* QR (only while awaiting scan) */}
      {state === "qr" && qr?.ascii && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Scan this QR in WhatsApp → Linked Devices
          </p>
          <pre className="text-[6px] leading-[6px] font-mono bg-white text-black overflow-auto">{qr.ascii}</pre>
        </div>
      )}

      {/* Not-configured / offline hint */}
      {(state === "offline" || state === "unconfigured") && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          {state === "unconfigured"
            ? "Control API not configured. Set WA_BOT_CONTROL_TOKEN (and optionally WA_BOT_CONTROL_PORT) and run the bot with --send."
            : "Bot process is not reachable on this host. Start it with: node scripts/whatsapp-order-bot.js --send (ideally under PM2)."}
        </div>
      )}

      {/* Recent logs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">Recent logs</p>
        {logs.length === 0 ? (
          <p className="text-xs text-gray-400">No logs available.</p>
        ) : (
          <pre className="text-[11px] leading-relaxed font-mono text-gray-700 bg-gray-50 rounded-xl border border-gray-100 p-3 max-h-96 overflow-auto whitespace-pre-wrap">{logs.join("\n")}</pre>
        )}
      </div>
    </div>
  );
}
