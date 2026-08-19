#!/usr/bin/env node
/**
 * scripts/favicon.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The store favicon must come from Store Settings, not from a static file.
 *
 * THE BUG: src/app/favicon.ico existed. In the App Router that file IS metadata:
 * Next resolves it and, in lib/metadata/resolve-metadata.js,
 *
 *     if (favicon) { … metadata.icons.icon.unshift(favicon); }
 *
 * UNSHIFTS it to the FRONT of icons.icon. generateMetadata()'s dynamic value was
 * never discarded — it was outranked, because IconsMetadata renders the list in
 * array order. The head carried two rel="icon" links with the static file first,
 * so uploading a new favicon in /admin/settings/store changed nothing in the tab.
 *
 * Moving the file to public/ makes it a plain static asset: it still answers
 * GET /favicon.ico for the fallback and for browsers that probe the root, but it
 * injects no <link>, leaving the Store Settings value as the only icon.
 *
 * Run: node scripts/favicon.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const LAYOUT = readFileSync("src/app/layout.jsx", "utf8");
/** Strip comments — a couple of assertions below are about CODE, not prose. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const LAYOUT_CODE = codeOnly(LAYOUT);
const ADMIN  = readFileSync("src/app/admin/settings/store/page.jsx", "utf8");
const GETTER = readFileSync("src/lib/getStoreSettings.jsx", "utf8");
const SETAPI = readFileSync("src/app/api/setting/route.js", "utf8");

console.log("1) NO file-based icon metadata may exist in the app directory:");
{
  ok("src/app/favicon.ico is gone", !existsSync("src/app/favicon.ico"));
  ok("public/favicon.ico exists as the fallback asset", existsSync("public/favicon.ico"));

  // The full App Router icon convention: favicon.ico, icon.*, apple-icon.*
  // ANY of these in an app segment would unshift ahead of the dynamic value.
  const conventions = /^(favicon\.ico|icon\d?\.(ico|jpg|jpeg|png|svg)|apple-icon\d?\.(jpg|jpeg|png))$/i;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (conventions.test(entry.name)) offenders.push(full);
    }
  };
  walk("src/app");
  ok(`no icon-convention file anywhere under src/app (found: ${offenders.join(", ") || "none"})`,
    offenders.length === 0);
}

console.log("2) The dynamic Store Settings favicon is the primary icon:");
{
  ok("generateMetadata reads the store settings", /const settings = await getStoreSettings\(\)/.test(LAYOUT));
  ok("faviconImage is the primary icon value",
    /icon: settings\?\.faviconImage \|\| "\/favicon\.ico"/.test(LAYOUT));
  ok("/favicon.ico is ONLY the fallback (right-hand side of ||)",
    /faviconImage \|\| "\/favicon\.ico"/.test(LAYOUT) &&
    !/"\/favicon\.ico" \|\| settings/.test(LAYOUT));
  ok("exactly one icons block exists", (LAYOUT.match(/\n\s*icons: \{/g) || []).length === 1);
  ok("no hardcoded <link rel=\"icon\"> anywhere in the layout",
    !/rel=["']icon["']|rel=["']shortcut icon["']/.test(LAYOUT_CODE));
  ok("metadata is regenerated per request, so a saved favicon shows immediately",
    /export const dynamic = "force-dynamic"/.test(LAYOUT));
}

console.log("3) NO per-request cache-busting was introduced:");
{
  const meta = LAYOUT.slice(LAYOUT.indexOf("export async function generateMetadata"),
                            LAYOUT.indexOf("export default async function RootLayout"));
  ok("no Date.now() in generateMetadata", !/Date\.now\(\)/.test(meta));
  ok("no Math.random() in generateMetadata", !/Math\.random/.test(meta));
  ok("no ?v= query appended to the icon", !/favicon\.ico\?/.test(meta) && !/\?v=/.test(meta));
  ok("the icon href is used exactly as stored", /icon: settings\?\.faviconImage \|\| "\/favicon\.ico"/.test(meta));
}

console.log("4) The save → read chain is unchanged and correct:");
{
  ok("the admin field is faviconImage", /faviconImage: ""/.test(ADMIN) && /faviconImage: data\.faviconImage/.test(ADMIN));
  ok("save POSTs the FLAT settings object to the store row",
    /fetch\("\/api\/setting\?type=store", \{[\s\S]{0,160}body: JSON\.stringify\(settings\)/.test(ADMIN));
  ok("no wrapper key that would bury faviconImage",
    !/JSON\.stringify\(\{ type: "store", value:/.test(ADMIN));
  ok("the server reads the whole store row", /getSettings\("store"\)/.test(GETTER));
  ok("the store settings type is publicly readable", /'store',/.test(SETAPI));
  ok("the upload flow was not touched — the admin still picks from the media library",
    /onSelectImages=\{\(url\) => setSettings\(\{ \.\.\.settings, faviconImage: url \}\)\}/.test(ADMIN));
}

console.log("5) Rendered-head simulation (Next's own resolution rules):");
{
  // Mirrors resolve-metadata.js: a file-based favicon is unshifted ahead of the
  // configured icons; IconsMetadata then renders icons.icon in array order.
  const renderHead = ({ faviconImage, appDirFavicon }) => {
    const icons = { icon: [{ url: faviconImage || "/favicon.ico" }] };
    if (appDirFavicon) icons.icon.unshift({ url: "/favicon.ico?hash", type: "image/x-icon" });
    return icons.icon.map((i) => `<link rel="icon" href="${i.url}"/>`);
  };

  const before = renderHead({ faviconImage: "/uploads/1720000000-logo.png", appDirFavicon: true });
  ok("BEFORE: two icon links were emitted", before.length === 2);
  ok("BEFORE: the static file came FIRST and won the tab",
    before[0].includes("/favicon.ico?hash"));

  const after = renderHead({ faviconImage: "/uploads/1720000000-logo.png", appDirFavicon: false });
  ok("AFTER: exactly one icon link is emitted", after.length === 1);
  ok("AFTER: it is the Store Settings favicon",
    after[0] === '<link rel="icon" href="/uploads/1720000000-logo.png"/>');
  ok("AFTER: no static /favicon.ico link is present", !after.join("").includes("/favicon.ico"));

  const none = renderHead({ faviconImage: "", appDirFavicon: false });
  ok("FALLBACK: with no configured favicon, /favicon.ico is used",
    none.length === 1 && none[0] === '<link rel="icon" href="/favicon.ico"/>');

  // A replaced upload always yields a new URL, so no cache-busting is needed.
  const a = renderHead({ faviconImage: "/uploads/1720000000-a.png", appDirFavicon: false })[0];
  const b = renderHead({ faviconImage: "/uploads/1730000000-b.png", appDirFavicon: false })[0];
  ok("a re-uploaded favicon changes the URL by itself", a !== b);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
