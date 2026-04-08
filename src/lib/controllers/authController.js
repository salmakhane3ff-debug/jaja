/**
 * src/lib/controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles login and admin-profile requests.
 * Called by the thin API route wrappers in /app/api/.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getOrCreateAdmin,
  findUserByEmail,
  comparePassword,
  hashPassword,
  signToken,
  updateUser,
} from '../services/authService.js';
import { mapUserProfile } from '../utils/mappers.js';
import { badRequest, unauthorized, notFound as _notFound, serverError } from '../utils/apiResponse.js';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/login
 * Body: { email, password }
 *
 * Authenticates the user, sets an HttpOnly `auth_token` JWT cookie, and
 * returns the user profile (no password field).
 */
function setAuthCookie(response, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  response.headers.set(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict${isProduction ? '; Secure' : ''}`
  );
}

export async function loginHandler(req) {
  try {
    const body = await req.json();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return badRequest('Email and password are required');
    }

    // ── Priority env-var login (works with or without a live database) ────────
    // If LOGIN_EMAIL + LOGIN_PASSWORD are set in .env and match the request,
    // grant access immediately. This supports:
    //   1. Dev mode (no PostgreSQL installed)
    //   2. Emergency admin access when the DB has no admin row yet
    const devEmail    = process.env.LOGIN_EMAIL?.trim();
    const devPassword = process.env.LOGIN_PASSWORD?.trim();

    if (devEmail && devPassword && email.trim() === devEmail && password === devPassword) {
      // Opportunistically try to enrich from DB, but never fail on it
      let tokenPayload = { userId: 'dev-admin', email: devEmail, role: 'ADMIN' };
      let userName     = 'Admin';
      try {
        const dbUser = await findUserByEmail(devEmail);
        if (dbUser) {
          tokenPayload = { userId: dbUser.id, email: dbUser.email, role: dbUser.role };
          userName     = dbUser.name ?? 'Admin';
        }
      } catch { /* DB unreachable — use dev payload */ }

      const token    = signToken(tokenPayload);
      const response = Response.json({
        success: true,
        message: 'Login successful',
        user: { id: tokenPayload.userId, email: devEmail, name: userName, role: 'ADMIN' },
      });
      setAuthCookie(response, token);
      return response;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Normal DB login — seed default admin row on first run
    await getOrCreateAdmin();

    // Look up the user
    const user = await findUserByEmail(email);
    if (!user) {
      return unauthorized('Invalid email or password');
    }

    // Verify password (supports legacy plaintext + bcrypt)
    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return unauthorized('Invalid email or password');
    }

    // Upgrade legacy plaintext password to bcrypt on successful login
    if (!user.password.startsWith('$2')) {
      const hashed = await hashPassword(password);
      await updateUser(user.id, { password: hashed });
    }

    // Sign JWT
    const token = signToken({
      userId: user.id,
      email:  user.email,
      role:   user.role,
    });

    // Build response
    const response = Response.json({
      success: true,
      message: 'Login successful',
      user: {
        id:    user.id,
        email: user.email,
        name:  user.name,
        role:  user.role,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return serverError('Internal server error');
  }
}

// ── Admin profile ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/profile
 * Returns the admin profile without the password field.
 */
export async function getProfileHandler() {
  try {
    const admin = await getOrCreateAdmin();
    return Response.json(mapUserProfile(admin));
  } catch (err) {
    console.error('Profile GET error:', err);
    return serverError('Failed to get profile');
  }
}

/**
 * PUT /api/admin/profile
 * Body: { email?, name?, currentPassword?, newPassword? }
 *
 * If `newPassword` is provided, `currentPassword` must match the stored hash.
 */
export async function updateProfileHandler(req) {
  try {
    const body = await req.json();
    const { email, currentPassword, newPassword, name } = body ?? {};

    const admin = await getOrCreateAdmin();

    // Verify current password when changing it
    if (newPassword) {
      if (!currentPassword) {
        return badRequest('Current password is required');
      }
      const valid = await comparePassword(currentPassword, admin.password);
      if (!valid) {
        return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
      }
    }

    const fields = {};
    if (email && email !== admin.email) fields.email = email;
    if (name  && name  !== admin.name)  fields.name  = name;

    const updated = await updateUser(admin.id, {
      ...fields,
      ...(newPassword ? { newPassword } : {}),
    });

    return Response.json({
      message: 'Profile updated successfully',
      profile: mapUserProfile(updated),
    });
  } catch (err) {
    console.error('Profile PUT error:', err);
    if (err.code === 'P2002') {
      return Response.json({ error: 'Email already exists' }, { status: 400 });
    }
    return serverError('Failed to update profile');
  }
}
