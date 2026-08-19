/**
 * src/lib/languageSettings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The single source of truth for the STORE DEFAULT language.
 *
 * Two different things are deliberately kept apart here:
 *
 *   A) the configured STORE DEFAULT — one server-side value, stored in the
 *      existing `Setting` row `language-settings` as `{ defaultLang }`. This is
 *      configuration; /admin/language always displays THIS, never whatever the
 *      admin's own browser happens to be set to.
 *
 *   B) a VISITOR's own preference — per-browser, in localStorage. It always
 *      wins over the store default, and changing the store default never
 *      rewrites it.
 *
 * THE BUG THIS FIXES: /admin/language POSTed `{ type, value: { defaultLang } }`
 * while /api/setting stores the posted object verbatim as the row's `data`.
 * The row therefore held `{ type, value: { defaultLang: 'fr' } }` and every
 * reader looked for `data.defaultLang`, found undefined, and fell back to 'ar'.
 * `readDefaultLang` still understands that legacy wrapper, so rows already
 * written the wrong way are repaired on read instead of needing a migration.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The settings row id. Not a new store — the existing generic Setting table. */
export const LANGUAGE_SETTINGS_TYPE = 'language-settings';

export const SUPPORTED_LANGS = Object.freeze(['ar', 'fr']);

/**
 * Last-resort fallback, used only when NOTHING is configured and no visitor
 * preference exists. It is never persisted as if it were a choice.
 */
export const FALLBACK_LANG = 'ar';

/** Per-browser storage key for a visitor's explicit choice. */
export const LANG_STORAGE_KEY = 'store_lang';

/** A supported language code, or null. Never guesses. */
export function normalizeLang(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return SUPPORTED_LANGS.includes(v) ? v : null;
}

/**
 * Read the configured store default out of a `language-settings` payload.
 *
 * Accepts the correct flat shape AND the legacy `{ value: { defaultLang } }`
 * wrapper that the old admin save produced, so an already-corrupted row starts
 * reporting the right language immediately.
 *
 * @returns {'ar'|'fr'|null} null when nothing valid is configured
 */
export function readDefaultLang(settings) {
  if (!settings || typeof settings !== 'object') return null;
  return normalizeLang(settings.defaultLang) ??
         normalizeLang(settings?.value?.defaultLang) ??
         null;
}

/**
 * The body to POST to /api/setting?type=language-settings.
 *
 * FLAT, matching every other settings writer in the admin — upsertSettings()
 * persists the posted object as the row's `data`, so any wrapper key would be
 * stored as part of the settings themselves.
 *
 * @returns {{defaultLang:'ar'|'fr'}}
 * @throws {Error} on an unsupported code, so a bad value can never be saved
 */
export function defaultLangPayload(lang) {
  const code = normalizeLang(lang);
  if (!code) throw new Error(`Unsupported language: ${lang}`);
  return { defaultLang: code };
}

/**
 * The language a VISITOR should see.
 *
 * Precedence — an explicit choice always beats configuration:
 *   1. the visitor's own stored preference
 *   2. the configured store default
 *   3. the fallback
 *
 * @param {{storedPreference?:string|null, storeDefault?:string|null}} input
 * @returns {'ar'|'fr'}
 */
export function resolveVisitorLang({ storedPreference = null, storeDefault = null } = {}) {
  return normalizeLang(storedPreference) ?? normalizeLang(storeDefault) ?? FALLBACK_LANG;
}

/**
 * The language /admin/language must DISPLAY in the Default Store Language
 * control. Configuration only — the admin's own browser preference is
 * deliberately not consulted, so a French default still reads "Français" in an
 * Arabic-browsing admin session.
 *
 * @returns {'ar'|'fr'}
 */
export function resolveAdminDisplayLang(settings) {
  return readDefaultLang(settings) ?? FALLBACK_LANG;
}
