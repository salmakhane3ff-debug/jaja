/**
 * ecosystem.config.js — PM2 process manifest
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone background workers that MUST run separately from the Next.js web
 * server (a generation cycle must never block a web request). Each engine holds
 * a session-level PostgreSQL advisory lock (pg_try_advisory_lock), so even if an
 * instance is accidentally duplicated only ONE actually ticks at a time — which
 * is why every engine is pinned to `instances: 1` / fork mode and must never be
 * scaled with `pm2 scale`.
 *
 * Deploy / update:
 *   pm2 start ecosystem.config.js                          # start (or refresh) every worker
 *   pm2 start ecosystem.config.js --only fake-orders-engine # add just the new worker to a live host
 *   pm2 save                                               # persist the process list across reboots
 *   pm2 startup                                            # (once per host) install the boot hook, then `pm2 save`
 *
 * Both engines ship OFF: they generate nothing until an admin opts in
 *   • UGC        → /admin/ugc-settings (earningsEngineEnabled)
 *   • Fake orders→ /admin/affiliates → 🎭 Fake Orders (per-affiliate `enabled`)
 * so it is safe to keep them running permanently; an idle tick is a no-op.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const engineDefaults = {
  exec_mode:          'fork',   // single process — NEVER cluster (advisory-locked)
  instances:          1,
  autorestart:        true,
  max_restarts:       20,
  restart_delay:      5000,     // back off 5s between crash restarts
  kill_timeout:       10000,    // give the in-flight tick time to drain on SIGTERM
  env:                { NODE_ENV: 'production' },
};

module.exports = {
  apps: [
    {
      // UGC virtual-earnings engine (existing).
      name:   'ugc-earnings-engine',
      script: 'scripts/ugc-earnings-engine.mjs',
      ...engineDefaults,
    },
    {
      // Fake Orders Engine (affiliate motivation). Same standalone/advisory-lock
      // pattern as the UGC engine — injects fake orders into the existing order
      // + commission pipeline, respecting every per-affiliate limit.
      name:   'fake-orders-engine',
      script: 'scripts/fake-orders-engine.mjs',
      ...engineDefaults,
    },
  ],
};
