/**
 * src/lib/utils/apiResponse.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standardized HTTP response helpers for Next.js API routes.
 * Keeps all route handlers thin and consistent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 200 OK — success with any payload */
export const ok = (data, status = 200) =>
  Response.json(data, { status });

/** Generic error response */
export const error = (message, status = 500) =>
  Response.json({ error: message }, { status });

/** 400 Bad Request */
export const badRequest = (message = 'Bad request') =>
  Response.json({ error: message }, { status: 400 });

/** 401 Unauthorized */
export const unauthorized = (message = 'Unauthorized') =>
  Response.json({ error: message }, { status: 401 });

/** 403 Forbidden */
export const forbidden = (message = 'Forbidden') =>
  Response.json({ error: message }, { status: 403 });

/** 404 Not Found */
export const notFound = (message = 'Not found') =>
  Response.json({ error: message }, { status: 404 });

/** 500 Internal Server Error */
export const serverError = (message = 'Internal server error') =>
  Response.json({ error: message }, { status: 500 });
