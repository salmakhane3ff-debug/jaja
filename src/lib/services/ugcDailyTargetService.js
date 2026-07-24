/**
 * src/lib/services/ugcDailyTargetService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Daily-target lifecycle for the simulation engine.
 *
 *   getOrCreateDailyTarget  — one target per (video, business day); dailyTarget is
 *                             picked ONCE (random in [min, max]) and never changes.
 *   emitOneSale             — atomically records ONE simulated sale:
 *                               • claims the next sequence via a guarded increment
 *                                 of UgcDailyTarget.generatedToday, AND
 *                               • inserts ONE UgcEarning (generatedSales=1,
 *                                 amount=commissionPerSale, key sim:<video>:<date>:<seq>)
 *                             in a SINGLE transaction. The guard + the UNIQUE key make
 *                             it double-pay-safe across restarts, retries and races.
 *
 * All progress is DB-derived (generatedToday), so nothing lives only in memory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { Prisma } from '../../generated/prisma/index.js';
import { buildSimKey, computeEarningAmount, pickDailyTarget } from '../ugcEarnings.js';
import { startOfBusinessDay, businessDateKey } from '../ugcTime.js';

const Decimal = Prisma.Decimal;
const BALANCE_ELIGIBLE_STATUS = 'available';

/**
 * Get today's target for a video, creating it once (fixed random target) if absent.
 * @returns {Promise<{ target: object|null, created: boolean }>}
 */
export async function getOrCreateDailyTarget({ video, now, tz, settings, db = prisma, rng = Math.random, log } = {}) {
  const generationDate = startOfBusinessDay(now, tz);
  const businessDate = businessDateKey(now, tz);

  const where = { ugcVideoId_generationDate: { ugcVideoId: video.id, generationDate } };
  let target = await db.ugcDailyTarget.findUnique({ where });
  if (target) return { target, created: false };

  const dailyTarget = pickDailyTarget(settings.minGeneratedSales, settings.maxGeneratedSales, rng);
  try {
    target = await db.ugcDailyTarget.create({
      data: {
        ugcVideoId: video.id,
        affiliateId: video.affiliateId,
        generationDate,
        businessDate,
        timezone: tz,
        dailyTarget,
        generatedToday: 0,
        completed: dailyTarget <= 0,
      },
    });
    if (log && log.dailyTargetGenerated) log.dailyTargetGenerated({ ugcVideoId: video.id, businessDate, dailyTarget, timezone: tz });
    return { target, created: true };
  } catch (err) {
    if (err && err.code === 'P2002') {
      // Lost a race to another tick — read the winner.
      target = await db.ugcDailyTarget.findUnique({ where });
      return { target, created: false };
    }
    throw err;
  }
}

/**
 * Record exactly ONE simulated sale for a video whose target row is `target`.
 * @returns {Promise<{ emitted:boolean, seq?:number, amount?:string, idempotencyKey?:string, completed?:boolean, reason?:string }>}
 */
export async function emitOneSale({ video, target, settings, db = prisma } = {}) {
  const seq = target.generatedToday;                       // 0-based sequence for THIS sale
  if (seq >= target.dailyTarget) return { emitted: false, reason: 'target_reached' };

  const key = buildSimKey(video.id, target.businessDate, seq);
  const amount = computeEarningAmount(1, settings.commissionPerSale); // Decimal, one sale
  const nextCount = seq + 1;
  const completed = nextCount >= target.dailyTarget;

  try {
    await db.$transaction(async (tx) => {
      // Guarded claim: only the tx that sees generatedToday === seq advances it,
      // so two ticks can never take the same sequence (no lost update / no dup).
      const upd = await tx.ugcDailyTarget.updateMany({
        where: { id: target.id, generatedToday: seq },
        data: { generatedToday: nextCount, completed },
      });
      if (upd.count === 0) throw Object.assign(new Error('sequence already claimed'), { code: 'UGC_SEQ_CONFLICT' });

      await tx.ugcEarning.create({
        data: {
          affiliateId: video.affiliateId,
          ugcVideoId: video.id,
          productId: video.productId,
          generatedSales: 1,
          commissionPerSale: new Decimal(settings.commissionPerSale),
          amount,
          generationDate: target.generationDate,
          generationPeriod: target.businessDate,
          idempotencyKey: key,             // UNIQUE — final double-pay backstop
          status: BALANCE_ELIGIBLE_STATUS,
        },
      });
    });
    return { emitted: true, seq, amount: String(amount), idempotencyKey: key, completed };
  } catch (err) {
    // Both are expected under a restart/retry/race → do NOT double-pay, just skip.
    if (err && (err.code === 'UGC_SEQ_CONFLICT' || err.code === 'P2002')) {
      return { emitted: false, reason: 'conflict' };
    }
    throw err;
  }
}
