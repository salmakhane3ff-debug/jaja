/**
 * src/lib/utils/validate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central input validation primitives used across all API routes.
 *
 * Every function either returns a safe, typed value or throws a typed Error
 * with { code: 'VALIDATION_ERROR' } so controllers can catch and return 422.
 *
 * Usage:
 *   import { requireString, requireFinancialAmount } from '@/lib/utils/validate';
 *   const amount = requireFinancialAmount(body.amount, 'amount');
 * ─────────────────────────────────────────────────────────────────────────────
 */

function fail(msg) {
  throw Object.assign(new Error(msg), { code: 'VALIDATION_ERROR' });
}

// ── Strings ───────────────────────────────────────────────────────────────────

/**
 * Require a non-empty string, trimmed.
 * @param {*}       value
 * @param {string}  field    — human-readable field name for error messages
 * @param {number}  [max=500]
 */
export function requireString(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`);
  if (value.trim().length > max) fail(`${field} must be at most ${max} characters`);
  return value.trim();
}

/**
 * Optional string — returns null when absent/empty, trimmed value otherwise.
 */
export function optionalString(value, field, max = 500) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') fail(`${field} must be a string`);
  if (value.trim().length > max) fail(`${field} must be at most ${max} characters`);
  return value.trim() || null;
}

// ── Numbers ───────────────────────────────────────────────────────────────────

/**
 * Require a finite, non-negative number.
 * Rejects NaN, Infinity, -Infinity, negative values.
 */
export function requireFinancialAmount(value, field = 'amount', { min = 0, max = 1_000_000 } = {}) {
  const n = parseFloat(value);
  if (!Number.isFinite(n))     fail(`${field} must be a finite number`);
  if (isNaN(n))                fail(`${field} is not a valid number`);
  if (n < min)                 fail(`${field} must be at least ${min}`);
  if (n > max)                 fail(`${field} must be at most ${max}`);
  return n;
}

/**
 * Require a positive integer.
 * @param {*}      value
 * @param {string} field
 * @param {number} [min=1]
 * @param {number} [max=1000]
 */
export function requirePositiveInt(value, field = 'quantity', { min = 1, max = 1000 } = {}) {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n))    fail(`${field} must be an integer`);
  if (n < min)                 fail(`${field} must be at least ${min}`);
  if (n > max)                 fail(`${field} must be at most ${max}`);
  return n;
}

/**
 * Require an integer within a bounded range (e.g. rating 1–5).
 */
export function requireBoundedInt(value, field, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

// ── Objects / Payloads ────────────────────────────────────────────────────────

const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strip prototype-pollution keys from a shallow object copy.
 * Returns a new plain object; arrays and non-objects are returned as-is.
 */
export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!POISON_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}

/**
 * Require that a value is a plain object (not null, not array).
 */
export function requireObject(value, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be a non-null object`);
  }
  return sanitizeObject(value);
}

// ── Enums ─────────────────────────────────────────────────────────────────────

/**
 * Require a value from a known set.
 */
export function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    fail(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}
