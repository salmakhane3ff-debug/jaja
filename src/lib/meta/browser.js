"use client";

/**
 * src/lib/meta/browser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * THE canonical browser-side Meta helper. Every fbq call in the app goes
 * through here — no component talks to `window.fbq` directly any more.
 *
 * WHAT IT FIXES:
 *
 * 1. THE PRE-READY RACE. Call sites used to guard with
 *        if (typeof window.fbq === "function") { … }
 *    and DROP the event otherwise. On a cold product-page load — a visitor
 *    arriving from a Meta ad, the highest-value case — the pixel snippet had not
 *    executed yet, so ViewContent silently vanished. Meta's own snippet installs
 *    a stub that QUEUES calls until fbevents.js loads; this helper installs that
 *    stub itself, so a call is always queued, never lost, and never replayed.
 *
 * 2. N² PAGEVIEW FAN-OUT. `fbq('track', …)` broadcasts to EVERY initialised
 *    pixel. The old loader emitted one full snippet per configured pixel, each
 *    doing init + track('PageView'), so N pixels produced N PageViews each.
 *    Here every pixel is initialised once and events are sent with
 *    `fbq('trackSingle', <pixelId>, …)`, which targets exactly one pixel.
 *
 * 3. UNVALIDATED PIXEL IDS. Only ids that passed isValidPixelId() ever reach
 *    fbq('init'), because one malformed id breaks the whole pixel.
 *
 * The page-view nonce lets callers build deterministic-but-per-navigation event
 * ids, so a re-render dedupes while a genuine second view does not.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isAllowedEvent } from './events.js';

const state = {
  initialised: false,
  pixelIds: [],
  enabled: false,
  pageViewNonce: '0',
  sent: new Set(),      // event ids already sent in this browsing session
};

/** True when the pixel is configured and switched on. */
export function isMetaEnabled() {
  return state.enabled && state.pixelIds.length > 0;
}

export function metaPixelIds() {
  return state.pixelIds.slice();
}

/**
 * Install Meta's standard stub so calls made before fbevents.js arrives are
 * queued by the library itself rather than dropped by us.
 * Idempotent: Meta's own snippet starts with `if (f.fbq) return`.
 */
export function ensureFbqStub(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  if (win.fbq) return win.fbq;

  const n = function (...args) {
    if (n.callMethod) n.callMethod.apply(n, args);
    else n.queue.push(args);
  };
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  win.fbq = n;
  if (!win._fbq) win._fbq = n;
  return n;
}

/**
 * Initialise every configured pixel EXACTLY once.
 *
 * Does not load fbevents.js — <MetaPixel> owns the <Script> tag so Next.js
 * controls its loading strategy. This only installs the stub and inits.
 *
 * @param {{enabled:boolean, pixelIds:string[]}} config  already validated server-side
 */
export function initMeta(config) {
  if (typeof window === 'undefined') return false;
  if (state.initialised) return isMetaEnabled();

  const pixelIds = Array.isArray(config?.pixelIds) ? config.pixelIds.filter(Boolean) : [];
  state.enabled = Boolean(config?.enabled) && pixelIds.length > 0;
  state.pixelIds = state.enabled ? pixelIds : [];
  state.initialised = true;

  if (!state.enabled) return false;

  const fbq = ensureFbqStub();
  if (!fbq) return false;

  for (const id of state.pixelIds) fbq('init', id);
  return true;
}

/** Mint a fresh page-view nonce. Called once per navigation by <MetaPixel>. */
export function newPageViewNonce(seed) {
  state.pageViewNonce = String(seed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return state.pageViewNonce;
}

/** The nonce for the current page view — the scope for per-view event ids. */
export function pageViewNonce() {
  return state.pageViewNonce;
}

/**
 * Send one browser event to EVERY configured pixel, once each.
 *
 * @param {string} eventName  must be in the allow-list
 * @param {object} params     custom_data
 * @param {{eventId?: string}} opts  shared with CAPI for deduplication
 * @returns {boolean} whether it was dispatched
 */
export function metaTrack(eventName, params = {}, { eventId } = {}) {
  if (!isMetaEnabled()) return false;
  if (!isAllowedEvent(eventName)) return false;
  if (typeof window === 'undefined') return false;

  // One event id is sent at most once per session, so a re-render, a Strict-Mode
  // double effect or a back-navigation cannot duplicate it.
  if (eventId) {
    if (state.sent.has(eventId)) return false;
    state.sent.add(eventId);
  }

  const fbq = ensureFbqStub();
  if (!fbq) return false;

  const options = eventId ? { eventID: eventId } : undefined;
  for (const id of state.pixelIds) {
    // trackSingle targets ONE pixel — plain track() would fan out to all of
    // them on every iteration and multiply the event by the pixel count.
    if (options) fbq('trackSingle', id, eventName, params, options);
    else fbq('trackSingle', id, eventName, params);
  }
  return true;
}

/** True when this event id has already been dispatched in this session. */
export function hasSent(eventId) {
  return Boolean(eventId) && state.sent.has(eventId);
}

/** TEST-ONLY: reset module state between cases. */
export function __resetMetaBrowserState() {
  state.initialised = false;
  state.pixelIds = [];
  state.enabled = false;
  state.pageViewNonce = '0';
  state.sent = new Set();
}
