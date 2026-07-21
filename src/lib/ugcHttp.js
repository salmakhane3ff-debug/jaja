/**
 * src/lib/ugcHttp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps ugcService coded errors to consistent HTTP responses. Transport concern
 * only — routes call this instead of embedding status logic (keeps routes thin).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STATUS = {
  UGC_UNAUTHENTICATED:    401,
  UGC_FORBIDDEN:          403,
  UGC_DISABLED:           403,
  UGC_BAD_ACTOR:          403,
  UGC_NOT_FOUND:          404,
  UGC_PRODUCT_NOT_FOUND:  404,
  UGC_BAD_INPUT:          400,
  UGC_CONSENT_REQUIRED:   400,
  UGC_INVALID_VIDEO:      400,
  UGC_REASON_REQUIRED:    400,
  UGC_BAD_STATUS:         400,
  UGC_INVALID_SETTINGS:   400,
  UGC_PRODUCT_INACTIVE:   409,
  UGC_ALREADY_SUBMITTED:  409,
  UGC_NOT_REPLACEABLE:    409,
  UGC_ILLEGAL_TRANSITION: 409,
  UGC_REPLACE_CONFLICT:   409,
  UGC_TRANSITION_CONFLICT: 409,
  UGC_UPLOAD_TOO_LARGE:   413,
};

export function ugcErrorResponse(err) {
  const code = err && err.code;
  const status = STATUS[code] || 500;
  if (status === 500) console.error('[ugc] unexpected error:', (err && err.message) || err);
  return Response.json(
    { error: (err && err.message) || 'Server error', code: code || 'UGC_ERROR' },
    { status },
  );
}
