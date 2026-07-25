/**
 * src/app/affiliate/dashboard/saleSound.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiny client-only "new sale" chime built on the Web Audio API — no audio asset,
 * no dependency. Browsers block audio until a user gesture, so `unlock()` resumes
 * the context on the first interaction; if a sale arrives before any gesture the
 * chime is simply skipped (standard autoplay behaviour), never an error.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function createSaleSound() {
  let ctx = null;

  function ensureCtx() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      try { ctx = new AudioCtx(); } catch { ctx = null; }
    }
    return ctx;
  }

  /** Resume/create the context on a user gesture so later chimes can play. */
  function unlock() {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  /** A short two-tone chime. Safe to call anytime; no-ops if audio is blocked. */
  function play() {
    try {
      const c = ensureCtx();
      if (!c) return;
      if (c.state === 'suspended') { c.resume().catch(() => {}); }
      const now = c.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const t = now + i * 0.13;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      });
    } catch { /* audio must never break the dashboard */ }
  }

  return { unlock, play };
}
