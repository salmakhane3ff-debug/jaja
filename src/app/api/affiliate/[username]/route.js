/**
 * /api/affiliate/[username]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → public referral endpoint.
 *       Looks up the affiliate by username, records a click, returns
 *       { affiliateId, username, name } so the frontend can store it.
 *
 * Called when a visitor lands via:
 *   site.com?ref=<username>  (frontend reads param and calls this endpoint)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAffiliateByUsernameHandler } from '@/lib/controllers/affiliateController';

export const GET = getAffiliateByUsernameHandler;
