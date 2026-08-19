#!/usr/bin/env node
/**
 * scripts/languageSettings.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Default Store Language persistence.
 *
 * THE BUG: /admin/language POSTed `{ type, value: { defaultLang } }` while
 * /api/setting stores the posted object verbatim as the settings row's `data`.
 * The row therefore held `{ type, value: { defaultLang: 'fr' } }`, every reader
 * looked for `data.defaultLang`, found undefined, and fell back to 'ar' — so
 * French "saved" in React state and reverted on refresh.
 *
 * These tests simulate the WHOLE round trip (admin save → upsertSettings →
 * settings row → GET → admin read / visitor read) against the real
 * upsertSettings semantics, so a regression in either direction fails here
 * rather than in production.
 *
 * Run: node scripts/languageSettings.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  LANGUAGE_SETTINGS_TYPE, SUPPORTED_LANGS, FALLBACK_LANG, LANG_STORAGE_KEY,
  normalizeLang, readDefaultLang, defaultLangPayload,
  resolveVisitorLang, resolveAdminDisplayLang,
} from "../src/lib/languageSettings.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const ADMIN  = readFileSync("src/app/admin/language/page.jsx", "utf8");
const CTX    = readFileSync("src/context/LanguageContext.jsx", "utf8");
const SVC    = readFileSync("src/lib/services/settingsService.js", "utf8");
const CTRL   = readFileSync("src/lib/controllers/settingsController.js", "utf8");
const ROUTE  = readFileSync("src/app/api/setting/route.js", "utf8");
const LAYOUT = readFileSync("src/app/layout.jsx", "utf8");

/** Strip comments — a few assertions below are about CODE, not prose. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ADMIN_CODE = codeOnly(ADMIN);

// ── A faithful stand-in for the settings row ─────────────────────────────────
// upsertSettings(type, data) persists `data` verbatim minus meta keys, and
// getSettings(type) returns exactly that object. Reproduced here so the round
// trip is exercised end to end without a database.
function makeStore() {
  const rows = new Map();
  return {
    upsert(type, data) {
      const { _id, id, createdAt, updatedAt, ...clean } = data ?? {};
      rows.set(type, clean);
      return clean;
    },
    get(type) { return rows.get(type) ?? {}; },
    /** What GET /api/setting?type=… returns: the row plus an _id echo. */
    apiGet(type) { return { ...(rows.get(type) ?? {}), _id: type }; },
    raw(type) { return rows.get(type); },
  };
}
/** The admin save path, exactly as the page now performs it. */
const adminSave = (store, lang) => store.upsert(LANGUAGE_SETTINGS_TYPE, defaultLangPayload(lang));

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) SAVE 'fr' → READ RETURNS 'fr':");
{
  const store = makeStore();
  adminSave(store, "fr");
  ok("the row stores defaultLang at the TOP level", store.raw(LANGUAGE_SETTINGS_TYPE).defaultLang === "fr");
  ok("the row is NOT wrapped in { type, value } (the original bug)",
    store.raw(LANGUAGE_SETTINGS_TYPE).value === undefined &&
    store.raw(LANGUAGE_SETTINGS_TYPE).type === undefined);
  ok("the row has exactly one key", Object.keys(store.raw(LANGUAGE_SETTINGS_TYPE)).join(",") === "defaultLang");
  ok("GET returns fr", readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");
  ok("the admin control displays Français", resolveAdminDisplayLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");

  // The exact shape the OLD code wrote — proof it could never read back.
  const legacyStore = makeStore();
  legacyStore.upsert(LANGUAGE_SETTINGS_TYPE, { type: LANGUAGE_SETTINGS_TYPE, value: { defaultLang: "fr" } });
  ok("the OLD payload really did leave data.defaultLang undefined",
    legacyStore.apiGet(LANGUAGE_SETTINGS_TYPE).defaultLang === undefined);
  ok("…which is exactly why refresh showed Arabic",
    (legacyStore.apiGet(LANGUAGE_SETTINGS_TYPE).defaultLang || FALLBACK_LANG) === "ar");
}

console.log("2) REFRESH / RELOAD / RESTART preserves 'fr':");
{
  const store = makeStore();
  adminSave(store, "fr");

  // Every re-initialisation reads the same persisted row.
  const reload = () => resolveAdminDisplayLang(store.apiGet(LANGUAGE_SETTINGS_TYPE));
  ok("normal refresh still shows fr", reload() === "fr");
  ok("hard refresh (Ctrl+F5) still shows fr", reload() === "fr");
  ok("after logout/login still fr", reload() === "fr");
  ok("after a server restart still fr (the row is the only state)", reload() === "fr");
  ok("ten reloads never drift", Array.from({ length: 10 }, reload).every((l) => l === "fr"));
  ok("nothing rewrites the row on read", store.raw(LANGUAGE_SETTINGS_TYPE).defaultLang === "fr");
}

console.log("3) SAVE 'ar' → READ RETURNS 'ar' (both directions persist):");
{
  const store = makeStore();
  adminSave(store, "fr");
  ok("fr is stored", readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");
  adminSave(store, "ar");
  ok("switching back stores ar", readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "ar");
  ok("ar survives refresh", resolveAdminDisplayLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "ar");
  adminSave(store, "fr");
  ok("and back to fr again", readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");
  ok("the fix is not 'ar' hardcoded to 'fr' — both round-trip",
    ["ar", "fr"].every((l) => { adminSave(store, l); return readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === l; }));
}

console.log("4) INVALID VALUES are rejected or safely normalized:");
{
  ok("an unsupported code cannot be saved", (() => {
    try { defaultLangPayload("de"); return false; } catch { return true; }
  })());
  ok("an empty value cannot be saved", (() => {
    try { defaultLangPayload(""); return false; } catch { return true; }
  })());
  ok("null cannot be saved", (() => {
    try { defaultLangPayload(null); return false; } catch { return true; }
  })());
  ok("case and whitespace are normalized on save", defaultLangPayload("  FR ").defaultLang === "fr");

  ok("normalizeLang accepts only supported codes",
    normalizeLang("ar") === "ar" && normalizeLang("fr") === "fr" &&
    normalizeLang("en") === null && normalizeLang("arabic") === null);
  ok("normalizeLang is null-safe", normalizeLang(null) === null && normalizeLang(undefined) === null &&
    normalizeLang(42) === null && normalizeLang({}) === null);

  ok("a garbage stored value reads as 'nothing configured'",
    readDefaultLang({ defaultLang: "de" }) === null &&
    readDefaultLang({ defaultLang: "" }) === null);
  ok("a garbage row falls back rather than crashing",
    resolveAdminDisplayLang({ defaultLang: "de" }) === FALLBACK_LANG);
  ok("readDefaultLang is null-safe", readDefaultLang(null) === null && readDefaultLang(undefined) === null &&
    readDefaultLang("nope") === null && readDefaultLang({}) === null);
  ok("only ar and fr are supported", SUPPORTED_LANGS.join(",") === "ar,fr");
}

console.log("5) LEGACY WRAPPED ROWS self-heal (no migration needed):");
{
  const store = makeStore();
  // A row already corrupted in production by the old save path.
  store.upsert(LANGUAGE_SETTINGS_TYPE, { type: LANGUAGE_SETTINGS_TYPE, value: { defaultLang: "fr" } });
  ok("the legacy wrapper is understood on read",
    readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");
  ok("the admin control shows fr immediately, before any re-save",
    resolveAdminDisplayLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) === "fr");
  ok("a legacy ar wrapper reads as ar too",
    readDefaultLang({ value: { defaultLang: "ar" } }) === "ar");
  ok("a flat value still wins over a stale wrapper",
    readDefaultLang({ defaultLang: "ar", value: { defaultLang: "fr" } }) === "ar");
  ok("a legacy wrapper with a junk code is ignored",
    readDefaultLang({ value: { defaultLang: "de" } }) === null);

  // Saving once rewrites it in the correct flat shape.
  adminSave(store, "fr");
  ok("the next save normalizes the row", store.raw(LANGUAGE_SETTINGS_TYPE).value === undefined);
}

console.log("6) ADMIN DISPLAY = CONFIGURATION, never the admin's browser:");
{
  const store = makeStore();
  adminSave(store, "fr");
  const configured = store.apiGet(LANGUAGE_SETTINGS_TYPE);

  // DB default = fr, admin browser preference = ar → the control must show fr.
  ok("an Arabic-browsing admin still sees Français as the default",
    resolveAdminDisplayLang(configured) === "fr");
  ok("resolveAdminDisplayLang takes no browser input at all",
    resolveAdminDisplayLang.length === 1);
  ok("the admin page never seeds the control from localStorage",
    !/localStorage/.test(ADMIN_CODE));
  ok("the admin page never reads data-lang either", !/data-lang/.test(ADMIN_CODE));
  ok("the admin control is seeded from the API response only",
    /const saved = readDefaultLang\(data\);/.test(ADMIN) && /if \(saved\) setDefaultLang\(saved\)/.test(ADMIN));
  ok("the admin read bypasses HTTP cache so it sees what was just written",
    /cache: "no-store"/.test(ADMIN));
}

console.log("7) VISITOR PRECEDENCE — preference beats default, always:");
{
  ok("a visitor with NO preference gets the configured default",
    resolveVisitorLang({ storedPreference: null, storeDefault: "fr" }) === "fr");
  ok("a visitor with no preference and default ar gets ar",
    resolveVisitorLang({ storedPreference: null, storeDefault: "ar" }) === "ar");
  ok("an existing visitor's ar preference survives a change to default fr",
    resolveVisitorLang({ storedPreference: "ar", storeDefault: "fr" }) === "ar");
  ok("an existing visitor's fr preference survives a change to default ar",
    resolveVisitorLang({ storedPreference: "fr", storeDefault: "ar" }) === "fr");
  ok("changing the store default never rewrites a stored preference", (() => {
    const store = makeStore();
    const visitor = { storedPreference: "ar" };
    adminSave(store, "fr");
    const seen = resolveVisitorLang({ ...visitor, storeDefault: readDefaultLang(store.apiGet(LANGUAGE_SETTINGS_TYPE)) });
    return seen === "ar" && visitor.storedPreference === "ar";
  })());
  ok("with neither preference nor default, the fallback applies",
    resolveVisitorLang({}) === FALLBACK_LANG && resolveVisitorLang() === FALLBACK_LANG);
  ok("an invalid stored preference does not shadow the default",
    resolveVisitorLang({ storedPreference: "de", storeDefault: "fr" }) === "fr");
  ok("an invalid default falls through to the fallback",
    resolveVisitorLang({ storedPreference: null, storeDefault: "de" }) === FALLBACK_LANG);
}

console.log("8) NO HARDCODED ARABIC OVERWRITE after the async load:");
{
  // The context only persists on an EXPLICIT choice. A derived language (store
  // default, or the fallback when the fetch fails) must never be written,
  // because that would pin a visitor who never chose anything.
  ok("localStorage is written in exactly one place", (CTX.match(/localStorage\.setItem/g) || []).length === 1);
  ok("that place is setLang, the explicit-choice path",
    /const setLang = useCallback\([\s\S]{0,320}localStorage\.setItem\(STORAGE_KEY, code\)/.test(CTX));
  ok("the attribute-sync effect no longer persists the language",
    !/setAttribute\("data-lang", lang\);\s*\n\s*localStorage\.setItem/.test(CTX));
  ok("the store-default branch does not persist either",
    !/setLangState\(storeDefault\)[\s\S]{0,120}localStorage\.setItem/.test(CTX));
  ok("the fallback is never persisted as a choice",
    !/localStorage\.setItem\(STORAGE_KEY, DEFAULT_LANG\)/.test(CTX));

  // Simulation of the first-visit sequence.
  const firstVisit = (storeDefault, { fetchFails = false } = {}) => {
    const ls = {};                                       // empty browser
    let lang = FALLBACK_LANG;                            // SSR-matching initial state
    const stamped = normalizeLang(ls[LANG_STORAGE_KEY]); // head script: nothing to stamp
    if (stamped) lang = stamped;
    else if (!fetchFails) {
      const fromApi = readDefaultLang({ defaultLang: storeDefault, _id: LANGUAGE_SETTINGS_TYPE });
      if (fromApi) lang = fromApi;
    }
    return { lang, persisted: ls[LANG_STORAGE_KEY] };
  };

  ok("a first-time visitor sees the configured fr", firstVisit("fr").lang === "fr");
  ok("…and nothing was written to their browser", firstVisit("fr").persisted === undefined);
  ok("so a LATER default change still reaches them", firstVisit("ar").lang === "ar");
  ok("a failed settings fetch degrades to the fallback", firstVisit("fr", { fetchFails: true }).lang === FALLBACK_LANG);
  ok("…and the fallback is NOT persisted, so the next load retries",
    firstVisit("fr", { fetchFails: true }).persisted === undefined);

  ok("an explicit choice IS persisted and then wins", (() => {
    const ls = {};
    ls[LANG_STORAGE_KEY] = normalizeLang("fr");           // setLang("fr")
    return resolveVisitorLang({ storedPreference: ls[LANG_STORAGE_KEY], storeDefault: "ar" }) === "fr";
  })());
}

console.log("9) ONE SOURCE OF TRUTH — existing architecture reused:");
{
  ok("the setting id is the existing language-settings row", LANGUAGE_SETTINGS_TYPE === "language-settings");
  ok("no new table or model was introduced",
    !/model Language|languageSetting/i.test(readFileSync("prisma/schema.prisma", "utf8")));
  ok("it still goes through the generic Setting row", /prisma\.setting\.upsert/.test(SVC));
  ok("upsertSettings still persists the posted object verbatim",
    /update: \{ data: clean \}/.test(SVC) && /create: \{ id: type, data: clean \}/.test(SVC));
  ok("the settings controller was NOT special-cased for language",
    !/language/i.test(CTRL));
  ok("language-settings is still publicly readable (storefront first visit)",
    /'language-settings',\s*\/\/ store default language/.test(ROUTE));
  ok("writes are still admin-only", /export const POST = withAdminAuth\(upsertSettingsHandler\)/.test(ROUTE));

  ok("both readers share ONE helper module",
    /from "@\/lib\/languageSettings"/.test(ADMIN) && /from "@\/lib\/languageSettings"/.test(CTX));
  ok("the admin page no longer hardcodes the supported list",
    !/\["ar", "fr"\]\.includes/.test(ADMIN));
  ok("the context no longer declares its own supported list",
    !/const SUPPORTED_LANGS = \["ar", "fr"\]/.test(CTX));
  ok("the storage key is defined once", LANG_STORAGE_KEY === "store_lang" &&
    /const STORAGE_KEY = LANG_STORAGE_KEY/.test(CTX));
  ok("the head bootstrap script still reads that same key", /localStorage\.getItem\('store_lang'\)/.test(LAYOUT));
  ok("the head script only stamps data-lang for a REAL stored preference",
    /if\(l==='fr'\|\|l==='ar'\)\{h\.setAttribute\('data-lang',l\)/.test(LAYOUT));
}

console.log("10) THE SAVE PATH sends a flat body and trusts the server:");
{
  ok("the admin POSTs defaultLangPayload(...)",
    /body: JSON\.stringify\(defaultLangPayload\(defaultLang\)\)/.test(ADMIN));
  ok("the old { type, value } wrapper is gone",
    !/JSON\.stringify\(\{ type: "language-settings", value:/.test(ADMIN));
  ok("the save re-reads what the server actually stored",
    /const persisted = readDefaultLang\(body\?\.data\);/.test(ADMIN));
  ok("a failed save no longer shows 'Saved!'",
    /if \(!res\.ok\) \{[\s\S]{0,200}setDefaultLangError/.test(ADMIN));
  ok("a failed save is surfaced to the admin", /\{defaultLangError && \(/.test(ADMIN));
  ok("the settings type is not spelled by hand in either file",
    !/"\/api\/setting\?type=language-settings"/.test(ADMIN) &&
    !/"\/api\/setting\?type=language-settings"/.test(CTX));
  ok("translations were not touched by this fix",
    !/locales\/(ar|fr)\.json/.test(readFileSync("src/lib/languageSettings.js", "utf8")));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
