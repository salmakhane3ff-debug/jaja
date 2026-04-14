/**
 * GET  /api/admin/profile  — fetch admin profile (no password)
 * PUT  /api/admin/profile  — update name / email / password (bcrypt-verified)
 * ─────────────────────────────────────────────────────────────────────────────
 * Security improvements over the legacy implementation:
 *   ✅ Password comparison uses bcrypt (was plaintext string match)
 *   ✅ New passwords are stored as bcrypt hashes (never plaintext)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProfileHandler,
  updateProfileHandler,
} from '@/lib/controllers/authController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET = withAdminAuth(getProfileHandler);
export const PUT = withAdminAuth(updateProfileHandler);
