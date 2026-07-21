/**
 * src/lib/services/ugcAuditService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence for the UGC settings audit trail (append-only).
 *
 * NON-FATAL BY CONTRACT: recording an audit row must never prevent an admin from
 * saving settings, and reading the history must never break the settings page.
 * Both functions swallow their own errors (including "table does not exist",
 * since the migration is additive and may not be applied yet) and degrade to
 * `{recorded:false}` / `[]`.
 *
 * The diff logic itself is pure and lives in src/lib/ugcSettingsAudit.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { diffUgcSettings, hasEarningsImpact } from '../ugcSettingsAudit.js';
import { recordUgcOpsFailure, UGC_OPS_OPERATION } from '../ugcOps.js';

/**
 * Record a settings change. No row is written when nothing actually changed.
 * @returns {Promise<{recorded:boolean, changes:Array, earningsAffecting:boolean}>}
 */
export async function recordUgcSettingsChange({
  actorId, actorType = 'ADMIN', before, after, db = prisma, onFailure = recordUgcOpsFailure,
} = {}) {
  let changes = [];
  try {
    changes = diffUgcSettings(before, after);
  } catch (err) {
    onFailure({ operation: UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE, error: err, context: { phase: 'diff', actorId } });
    return { recorded: false, changes: [], earningsAffecting: false };
  }
  const earningsAffecting = hasEarningsImpact(changes);
  if (changes.length === 0) return { recorded: false, changes, earningsAffecting };

  try {
    if (!db?.ugcSettingsHistory?.create) {
      onFailure({
        operation: UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE,
        error: 'ugcSettingsHistory model unavailable (migration not applied?)',
        context: { actorId, changeCount: changes.length, earningsAffecting },
      });
      return { recorded: false, changes, earningsAffecting };
    }
    await db.ugcSettingsHistory.create({
      data: { actorId: actorId || null, actorType, changes, earningsAffecting },
    });
    return { recorded: true, changes, earningsAffecting };
  } catch (err) {
    // Audit is best-effort — never block the settings save — but never silent:
    // an unrecorded EARNINGS-AFFECTING change is exactly what we must notice.
    onFailure({
      operation: UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE,
      error: err,
      context: { actorId, changeCount: changes.length, earningsAffecting },
    });
    return { recorded: false, changes, earningsAffecting };
  }
}

/** Most recent settings changes (newest first). Returns [] on any failure (logged). */
export async function listUgcSettingsHistory({ limit = 20, db = prisma, onFailure = recordUgcOpsFailure } = {}) {
  try {
    if (!db?.ugcSettingsHistory?.findMany) return [];
    return await db.ugcSettingsHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, Number(limit) || 20), 100),
    });
  } catch (err) {
    onFailure({ operation: UGC_OPS_OPERATION.AUDIT_SETTINGS_READ, error: err });
    return [];
  }
}
