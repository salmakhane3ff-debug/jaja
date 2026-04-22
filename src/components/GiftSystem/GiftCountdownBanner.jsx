"use client";

/**
 * GiftCountdownBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a live countdown timer when a free gift with a time limit is in cart.
 *
 * - Reads expiry timestamps from localStorage (set by GiftSystemInit)
 * - Ticks every second via setInterval
 * - When timer reaches 0: removes the gift from cart + clears localStorage key
 * - Dismissable per session (won't re-appear after dismiss until page reload)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";
import { Gift, X, Clock } from "lucide-react";

// Format seconds → MM:SS
function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function GiftCountdownBanner() {
  // { [giftId]: { title, expiresAt, dismissed } }
  const [timers, setTimers] = useState({});
  const [now, setNow]       = useState(() => Date.now());

  // ── Read active gift expiries from localStorage ───────────────────────────
  const syncFromStorage = useCallback(() => {
    try {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      const giftItems = cart.filter((i) => i._isGift && (i._countdownMinutes || 0) > 0);

      setTimers((prev) => {
        const next = { ...prev };

        // Add / refresh timers for gifts currently in cart
        giftItems.forEach((item) => {
          const expiryKey = `gift_expiry_${item._giftId}`;
          const expiresAt = parseInt(localStorage.getItem(expiryKey), 10);
          if (!expiresAt || isNaN(expiresAt)) return;

          if (!next[item._giftId] || next[item._giftId].expiresAt !== expiresAt) {
            next[item._giftId] = {
              title:     item.title,
              expiresAt,
              dismissed: next[item._giftId]?.dismissed || false,
            };
          }
        });

        // Remove timers for gifts no longer in cart
        const cartGiftIds = new Set(giftItems.map((i) => i._giftId));
        Object.keys(next).forEach((id) => {
          if (!cartGiftIds.has(id)) delete next[id];
        });

        return next;
      });
    } catch {}
  }, []);

  // ── On mount: sync + listen for cart changes ──────────────────────────────
  useEffect(() => {
    syncFromStorage();
    window.addEventListener("cartUpdated",        syncFromStorage);
    window.addEventListener("giftCountdownStart", syncFromStorage);
    return () => {
      window.removeEventListener("cartUpdated",        syncFromStorage);
      window.removeEventListener("giftCountdownStart", syncFromStorage);
    };
  }, [syncFromStorage]);

  // ── Tick every second ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Expire: remove gift from cart when timer hits 0 ───────────────────────
  useEffect(() => {
    Object.entries(timers).forEach(([giftId, timer]) => {
      if (now >= timer.expiresAt) {
        // Remove expired gift from cart
        try {
          const cart    = JSON.parse(localStorage.getItem("cart") || "[]");
          const updated = cart.filter((i) => i._giftId !== giftId);
          if (updated.length !== cart.length) {
            localStorage.setItem("cart", JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent("cartUpdated"));
          }
          localStorage.removeItem(`gift_expiry_${giftId}`);
        } catch {}

        setTimers((prev) => {
          const next = { ...prev };
          delete next[giftId];
          return next;
        });
      }
    });
  }, [now, timers]);

  const dismiss = (giftId) => {
    setTimers((prev) => ({
      ...prev,
      [giftId]: { ...prev[giftId], dismissed: true },
    }));
  };

  // ── Only render timers that are active and not dismissed ──────────────────
  const visible = Object.entries(timers).filter(
    ([, t]) => !t.dismissed && now < t.expiresAt
  );

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col gap-0">
      {visible.map(([giftId, timer]) => {
        const remaining = (timer.expiresAt - now) / 1000;
        const pct       = 100; // we don't know total duration after remount; skip bar
        const urgent    = remaining < 60;

        return (
          <div
            key={giftId}
            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold
              ${urgent
                ? "bg-red-600 text-white"
                : "bg-gradient-to-r from-purple-700 to-pink-600 text-white"}`}
            style={{ animation: "slideDown 0.35s ease" }}
          >
            {/* Left: icon + label */}
            <div className="flex items-center gap-2 min-w-0">
              <Gift className="w-4 h-4 shrink-0" />
              <span className="truncate">
                🎁 CADEAU GRATUIT —{" "}
                <span className="font-normal opacity-90">{timer.title}</span>
              </span>
            </div>

            {/* Center: countdown */}
            <div className={`flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full font-black text-base tabular-nums
              ${urgent ? "bg-white/20" : "bg-white/15"}`}>
              <Clock className="w-3.5 h-3.5" />
              {fmt(remaining)}
            </div>

            {/* Right: dismiss */}
            <button
              onClick={() => dismiss(giftId)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
