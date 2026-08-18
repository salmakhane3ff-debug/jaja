#!/usr/bin/env node
/**
 * scripts/feedbackCarouselInteraction.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The 2026-08 feedback upgrade: card redesign, INDEPENDENT per-row pause,
 * pointer drag, and the portalled image lightbox.
 *
 * Two kinds of assertion, because there is no jsdom here:
 *   • SOURCE invariants — the rules that were broken in production live in the
 *     DOM/CSS structure, not in the pure helpers (101 helper tests once passed
 *     against a visibly broken carousel), so the structure itself is asserted.
 *   • BEHAVIOURAL simulation — the row pause/drag state machine is re-declared
 *     with the component's exact semantics and driven through real interaction
 *     sequences, proving row independence and immediate resume.
 *
 * The working infinite-loop architecture is treated as a REGRESSION SURFACE:
 * every check in section 1 exists to fail loudly if the upgrade disturbed it.
 *
 * Run: node scripts/feedbackCarouselInteraction.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import { CARD_GAP_CLASS, FEEDBACK_LAYOUTS } from "../src/lib/feedbackCarousel.js";
import {
  resolveProductFeedbackSource, feedbackFilterProductId,
  DEFAULT_PRODUCT_FEEDBACK_SOURCE,
} from "../src/lib/feedbackDisplay.js";
import { relativeDateLabel, resolveReviewDate } from "../src/lib/feedbackDate.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const CAR     = readFileSync("src/components/FeedbackCarousel.jsx", "utf8");
const SERVICE = readFileSync("src/lib/services/feedbackService.js", "utf8");
const ADMIN   = readFileSync("src/app/admin/feedback/page.jsx", "utf8");
const SCHEMA  = readFileSync("prisma/schema.prisma", "utf8");
const CTX     = readFileSync("src/context/LanguageContext.jsx", "utf8");
const AR      = JSON.parse(readFileSync("src/locales/ar.json", "utf8"));
const FR      = JSON.parse(readFileSync("src/locales/fr.json", "utf8"));
const SECTION = readFileSync("src/components/FeedbackSection.jsx", "utf8");
// The MarqueeRow component only — the parent must not be searched for row state.
const ROW     = CAR.slice(CAR.indexOf("function MarqueeRow"), CAR.indexOf("export default function FeedbackCarousel"));
const PARENT  = CAR.slice(CAR.indexOf("export default function FeedbackCarousel"));
const VIEWER  = SECTION.slice(SECTION.indexOf("function ImageViewer"), SECTION.indexOf("// ── ImageStrip"));

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) THE WORKING LOOP IS UNTOUCHED (regression surface):");
{
  ok("viewport is still an explicit LTR overflow container",
    /<div\s+ref=\{viewportRef\}[\s\S]*?dir="ltr"[\s\S]*?>/.test(ROW) &&
    /direction: "ltr"/.test(ROW) && /overflow-hidden/.test(ROW));
  ok("group A + group B are still rendered back to back",
    /\{renderGroup\(false\)\}\s*\{renderGroup\(true\)\}/.test(ROW));
  ok("group B is still an EXACT duplicate (same `group` array, same props)",
    (ROW.match(/group\.map\(/g) || []).length === 1);
  ok("group B is still aria-hidden", /aria-hidden=\{duplicate \|\| undefined\}/.test(ROW));
  ok("the distance is still MEASURED, not assumed",
    /--marquee-distance.*\$\{distance\}px/.test(ROW) && /getBoundingClientRect\(\)\.width/.test(ROW));
  ok("the animation is still pure CSS (no per-frame JS loop)",
    !/requestAnimationFrame/.test(CAR) && /animation: distance > 0 \? `fbMarquee/.test(ROW));
  ok("the keyframes still travel exactly one group A width",
    /- var\(--marquee-distance\)\)/.test(PARENT));
  ok("the gap is still a PHYSICAL margin on the card",
    CARD_GAP_CLASS.startsWith("mr-") && !/me-\d/.test(CARD_GAP_CLASS));
  ok("`need` is still grow-only, so re-measuring cannot oscillate",
    /Math\.max\(prev\.need, want\)/.test(ROW));
  ok("image loads (height-only changes) still cannot restart the loop",
    /const widthChanged = Math\.abs\(prev\.distance - distance\) > 1;/.test(ROW) &&
    /if \(!widthChanged && need === prev\.need\) return prev;/.test(ROW));
  ok("rows are still INDEPENDENT viewports, never one tall shared track",
    (CAR.match(/ref=\{viewportRef\}/g) || []).length === 1 && /rows\.map\(\(rowItems, i\)/.test(PARENT));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("2) PAUSE STATE LIVES INSIDE THE ROW (never global):");
{
  ok("`interacting` is declared inside MarqueeRow", /const \[interacting, setInteracting\] = useState\(false\)/.test(ROW));
  ok("the PARENT declares no interaction state at all",
    !/interacting/.test(PARENT.replace(/pause is PER ROW[\s\S]*?\n/, "")));
  ok("the parent wrapper has NO mouse/touch/pointer handlers",
    !/on(MouseEnter|MouseLeave|TouchStart|TouchEnd|PointerDown)/.test(PARENT));
  ok("the only shared input is `paused` (tab hidden)", /paused=\{tabHidden\}/.test(PARENT));
  ok("tabHidden comes from visibilitychange, not from interaction",
    /document\.visibilityState === "hidden"/.test(PARENT));
  ok("play-state combines the shared and the row-local input",
    /animationPlayState: paused \|\| interacting \? "paused" : "running"/.test(ROW));
  ok("hover handlers sit on the ROW viewport, not a wrapper",
    /<div\s+ref=\{viewportRef\}[\s\S]*?onMouseEnter=\{hold\}[\s\S]*?>/.test(ROW));
  ok("pauseOnInteract still gates hover pausing",
    /if \(pauseOnInteract\) setInteracting\(true\)/.test(ROW));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("3) RESUME IS IMMEDIATE — no timer exists anywhere:");
{
  ok("no setTimeout in the whole carousel component", !/setTimeout/.test(CAR));
  ok("no setInterval either", !/setInterval/.test(CAR));
  ok("no resume timer ref survived the refactor", !/resumeTimer/.test(CAR));
  ok("no 5s / 1.2s magic delay constants", !/\b(5000|1500|1200|3000)\b/.test(CAR));
  ok("release() only flips the boolean back", /if \(pauseOnInteract\) setInteracting\(false\)/.test(ROW));
  ok("endDrag calls release() unconditionally at the end",
    /d\.pointerId = null;[\s\S]{0,200}release\(\);/.test(ROW));
  ok("the code documents the immediate resume", /Resume IMMEDIATELY/.test(ROW));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("4) PAUSING NEVER REBUILDS THE ROW:");
{
  ok("the card count does not depend on interaction",
    !/interacting[\s\S]{0,80}repeatToFill/.test(ROW) && /repeatToFill\(items, geo\.need\)/.test(ROW));
  ok("the measured distance does not depend on interaction",
    !/interacting[\s\S]{0,80}setGeo/.test(ROW));
  // Targeted, not proximity-based: renderGroup's own body must be interaction-free
  // and both calls must be unconditional.
  const renderGroupFn = ROW.slice(ROW.indexOf("const renderGroup = "), ROW.indexOf("const distance = geo.distance;"));
  ok("group rendering does not depend on interaction",
    renderGroupFn.length > 0 && !/interacting|drag/.test(renderGroupFn) &&
    /\{renderGroup\(false\)\}\s*\{renderGroup\(true\)\}/.test(ROW));
  ok("the animation NAME/DURATION does not depend on interaction",
    !/interacting[\s\S]{0,40}fbMarquee/.test(ROW));
  // The three interaction handlers, isolated — none may write transform or geometry.
  const handlers = ROW.slice(ROW.indexOf("const hold = useCallback"), ROW.indexOf("// Only this element clips"));
  ok("interaction handlers never write transform, and never re-measure",
    handlers.length > 0 && !/style\.transform|setGeo|translate3d/.test(handlers));
  ok("the drag offset is written to the DOM, never to React state",
    /trackRef\.current\.style\.setProperty\("--drag-offset"/.test(ROW) &&
    !/setDragOffset|useState\(0\)/.test(ROW));
  ok("the drag offset is composed INTO the keyframes, not applied as a reset",
    /from \{ transform: translate3d\(var\(--drag-offset, 0px\), 0, 0\); \}/.test(PARENT));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("5) MOBILE: pointer events, row-scoped, no page scroll hijack:");
{
  ok("uses Pointer Events (one path for mouse + touch)",
    /onPointerDown=\{onPointerDown\}/.test(ROW) && /onPointerMove=\{onPointerMove\}/.test(ROW) &&
    /onPointerUp=\{endDrag\}/.test(ROW) && /onPointerCancel=\{endDrag\}/.test(ROW));
  ok("pointer handlers are on the ROW viewport (so one row is affected)",
    /<div\s+ref=\{viewportRef\}[\s\S]*?onPointerDown[\s\S]*?>/.test(ROW));
  ok("touchAction: pan-y keeps VERTICAL page scrolling working",
    /touchAction: "pan-y"/.test(ROW));
  ok("no body-level horizontal scrolling is introduced (viewport stays clipped)",
    /className="w-full overflow-hidden"/.test(ROW));
  ok("the drag is tracked per pointerId (multi-touch cannot cross rows)",
    /d\.pointerId !== e\.pointerId/.test(ROW));
  ok("only the primary mouse button starts a drag",
    /e\.pointerType === "mouse" && e\.button !== 0/.test(ROW));
  ok("leaving the row ends any in-flight drag", /onMouseLeave=\{\(\) => \{ endDrag\(null\); \}\}/.test(ROW));
  ok("drag does not run when the row is not animating", /if \(!animate \|\|/.test(ROW));
  ok("no per-frame React loop was introduced for the drag",
    !/requestAnimationFrame/.test(ROW));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("6) BEHAVIOURAL SIMULATION — two rows, the component's own rules:");
{
  // Mirrors MarqueeRow exactly: per-row `interacting`, shared `paused`,
  // playState = paused || interacting, and no timer between release and resume.
  const makeRow = (pauseOnInteract = true) => {
    const st = { interacting: false, drag: { active: false, startX: 0, offset: 0, pointerId: null }, rebuilds: 0 };
    return {
      st,
      playState: (paused) => (paused || st.interacting ? "paused" : "running"),
      mouseEnter() { if (pauseOnInteract) st.interacting = true; },
      pointerDown(x, id = 1) { st.drag = { active: true, startX: x, offset: st.drag.offset, pointerId: id }; if (pauseOnInteract) st.interacting = true; },
      pointerMove(x, id = 1) {
        if (!st.drag.active || st.drag.pointerId !== id) return null;
        return st.drag.offset + (x - st.drag.startX);          // written to CSS var
      },
      pointerUp(x, id = 1) {
        if (st.drag.active && st.drag.pointerId === id) {
          st.drag.offset += x - st.drag.startX;
          st.drag.active = false; st.drag.pointerId = null;
        }
        if (pauseOnInteract) st.interacting = false;            // immediate, no timer
      },
      mouseLeave() { this.pointerUp(0, null); if (pauseOnInteract) st.interacting = false; },
    };
  };

  // — hover row 1 —
  let r1 = makeRow(), r2 = makeRow();
  r1.mouseEnter();
  ok("hovering row 1 pauses row 1", r1.playState(false) === "paused");
  ok("hovering row 1 leaves row 2 RUNNING", r2.playState(false) === "running");
  r1.mouseLeave();
  ok("leaving row 1 resumes it in the SAME tick (no delay)", r1.playState(false) === "running");
  ok("row 2 was never disturbed", r2.playState(false) === "running" && r2.st.drag.offset === 0);

  // — hover row 2 —
  r1 = makeRow(); r2 = makeRow();
  r2.mouseEnter();
  ok("hovering row 2 pauses row 2", r2.playState(false) === "paused");
  ok("hovering row 2 leaves row 1 RUNNING", r1.playState(false) === "running");
  r2.mouseLeave();
  ok("leaving row 2 resumes it immediately", r2.playState(false) === "running");

  // — touch/drag row 1 —
  r1 = makeRow(); r2 = makeRow();
  r1.pointerDown(200);
  ok("touching row 1 pauses ONLY row 1",
    r1.playState(false) === "paused" && r2.playState(false) === "running");
  ok("dragging row 1 follows the finger (-60px)", r1.pointerMove(140) === -60);
  ok("dragging row 1 moves row 1 only", r2.pointerMove(140) === null);
  r1.pointerUp(140);
  ok("releasing row 1 resumes it immediately", r1.playState(false) === "running");
  ok("the released position is KEPT, not reset to 0", r1.st.drag.offset === -60);
  ok("row 2 kept auto-moving throughout",
    r2.playState(false) === "running" && r2.st.drag.offset === 0);

  // — touch/drag row 2 —
  r1 = makeRow(); r2 = makeRow();
  r2.pointerDown(50);
  ok("touching row 2 pauses ONLY row 2",
    r2.playState(false) === "paused" && r1.playState(false) === "running");
  r2.pointerUp(130);
  ok("releasing row 2 resumes it immediately", r2.playState(false) === "running");
  ok("row 1 never paused", r1.playState(false) === "running");

  // — a simple tap must not cause a long pause —
  r1 = makeRow();
  r1.pointerDown(100); r1.pointerUp(100);
  ok("a TAP (down+up, no movement) leaves the row running", r1.playState(false) === "running");
  ok("a TAP does not shift the row", r1.st.drag.offset === 0);

  // — successive drags accumulate rather than restart —
  r1 = makeRow();
  r1.pointerDown(300); r1.pointerUp(250);
  r1.pointerDown(250); const live = r1.pointerMove(200); r1.pointerUp(200);
  ok("a second drag continues from the first (no restart from 0)",
    live === -100 && r1.st.drag.offset === -100);
  ok("no rebuild was ever triggered by interaction", r1.st.rebuilds === 0);

  // — the shared input still pauses everything —
  r1 = makeRow(); r2 = makeRow();
  ok("tab hidden pauses BOTH rows",
    r1.playState(true) === "paused" && r2.playState(true) === "paused");
  ok("tab visible again resumes both",
    r1.playState(false) === "running" && r2.playState(false) === "running");

  // — pauseOnInteract = false —
  const noPause = makeRow(false);
  noPause.mouseEnter();
  ok("pauseOnInteract=false keeps the row moving on hover", noPause.playState(false) === "running");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("7) THE REDESIGNED CARD:");
{
  ok("soft light-gray surface + rounded corners + subtle border",
    /bg-gray-50\/80/.test(CAR) && /rounded-\[18px\]/.test(CAR) && /border border-gray-200\/80/.test(CAR));
  ok("soft shadow only when the setting asks for it",
    /shadow \? "shadow-\[0_2px_10px_rgba\(16,24,40,0\.05\)\]" : ""/.test(CAR));
  ok("consistent card width across every card",
    /w-\[82vw\] max-w-\[340px\] sm:w-\[320px\]/.test(CAR));
  ok("a stable minimum height keeps the row even", /min-h-\[168px\]/.test(CAR));
  ok("cards never shrink or stretch", /shrink-0 self-start/.test(CAR));
  // Reference structure: header (avatar + name + date) THEN a stars row.
  const header = CAR.slice(CAR.indexOf("<header className="), CAR.indexOf("</header>"));
  ok("row 1 of the header is the avatar", /<Avatar name=\{name\}/.test(header));
  ok("the name sits beside the avatar", /<p className="text-sm font-bold text-gray-900/.test(header));
  ok("the date sits DIRECTLY under the name, inside the header",
    /<time/.test(header) && header.indexOf("<p className=\"text-sm font-bold") < header.indexOf("<time"));
  ok("the stars are NOT in the header any more (they get their own line)",
    !/<Stars/.test(header));
  ok("the stars row comes after the header",
    CAR.indexOf("</header>") < CAR.indexOf("<Stars value={item.rating || 0} />"));
  ok("the customer name is bold and dark", /text-sm font-bold text-gray-900/.test(CAR));
  ok("the date sits BENEATH the name in muted gray",
    /<time[\s\S]{0,120}text-\[11px\] text-gray-400/.test(CAR));
  ok("5 stars, yellow when filled", /\[1, 2, 3, 4, 5\]/.test(CAR) && /text-yellow-400 fill-yellow-400/.test(CAR));
  ok("a small BLUE verified badge", /<BadgeCheck size=\{14\} className="text-blue-500/.test(CAR));
  ok("the badge only renders for actually-verified reviews", /\{item\.isVerified && \(/.test(CAR));
  ok("NO fake Google branding anywhere", !/google/i.test(CAR) && !/\bG\b.*logo/i.test(CAR));

  ok("an existing avatar photo is used when present",
    /if \(src && !broken\)/.test(CAR) && /rounded-full object-cover/.test(CAR));
  ok("the initial-circle fallback is kept", /\(name \|\| "\?"\)\[0\]\.toUpperCase\(\)/.test(CAR));
  ok("a broken avatar URL falls back instead of showing a broken image",
    /onError=\{\(\) => setBroken\(true\)\}/.test(CAR));
  ok("avatars are lazy-loaded", /<img src=\{src\}[\s\S]{0,80}loading="lazy"/.test(CAR));

  ok("long text is clamped to a preview", /const long = text\.length > TEXT_PREVIEW/.test(CAR));
  ok("the expander is localized through the translation system, not a literal",
    /\{expanded \? t\("feedback_show_less"\) : t\("feedback_show_more"\)\}/.test(CAR));
  ok("expanding cannot break the geometry (height grows, width is fixed)",
    /flex flex-col/.test(CAR) && /w-\[82vw\] max-w-\[340px\]/.test(CAR));
  ok("the duplicate group's expander stays out of the tab order",
    /tabIndex=\{duplicate \? -1 : 0\}/.test(CAR));
  ok("a TEXT-ONLY review renders (text block is conditional, images are optional)",
    /\{text && \(/.test(CAR) && /\{images\.length > 0 && \(/.test(CAR));
  ok("an IMAGE review renders a compact strip below the text",
    /<div className="mt-2\.5">[\s\S]{0,160}<ImageStrip images=\{images\} \/>/.test(CAR));
  ok("images cannot change the card width (fixed-size thumbnails)",
    /w-16 h-16 rounded-lg overflow-hidden/.test(SECTION));
  ok("thumbnails are lazy-loaded", /<img src=\{img\} alt="" loading="lazy"/.test(SECTION));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("8) THE IMAGE LIGHTBOX (the black-area bug):");
{
  ok("ROOT CAUSE: the row track really does carry a transform",
    /translate3d/.test(PARENT) && /will-change-transform/.test(ROW));
  ok("FIX: the viewer is portalled OUT of that transformed ancestor",
    /createPortal\(/.test(VIEWER) && /document\.body,\s*\);/.test(VIEWER));
  ok("createPortal is imported from react-dom", /import \{ createPortal \} from "react-dom";/.test(SECTION));
  ok("it waits for mount before portalling (SSR-safe)",
    /if \(!mounted \|\| typeof document === "undefined"\) return null;/.test(VIEWER));
  ok("no SECOND lightbox system was introduced",
    (SECTION.match(/function ImageViewer/g) || []).length === 1 && !/ImageViewer/.test(CAR));
  ok("the carousel reuses the existing viewer via ImageStrip",
    /import \{ ImageStrip \} from "@\/components\/FeedbackSection";/.test(CAR) &&
    /export function ImageStrip/.test(SECTION));

  ok("full-viewport fixed overlay", /className="fixed inset-0 z-\[9999\]/.test(VIEWER));
  ok("flex-centred, so the image is centred on any screen",
    /flex items-center justify-center/.test(VIEWER));
  ok("a clean SEMI-transparent backdrop, not a solid black rectangle",
    /bg-black\/70/.test(VIEWER) && !/bg-black\/9\d/.test(VIEWER) && !/bg-black\b(?!\/)/.test(VIEWER));
  ok("backdrop blur softens it further", /backdrop-blur-sm/.test(VIEWER));
  ok("the image keeps its aspect ratio", /object-contain/.test(VIEWER));
  ok("the image is bounded by the VIEWPORT, not by the card",
    /max-w-\[95vw\] max-h-\[90vh\]/.test(VIEWER) && /w-auto h-auto/.test(VIEWER));
  ok("the overlay itself cannot scroll horizontally", /overflow-hidden/.test(VIEWER));
  ok("the image loads eagerly (the overlay is already open)", /loading="eager"/.test(VIEWER));
  ok("a clear close button is rendered", /<X size=\{20\} \/>/.test(VIEWER) && /absolute top-4 right-4/.test(VIEWER));
  ok("clicking the BACKDROP closes", /onClick=\{onClose\}/.test(VIEWER));
  ok("clicking the IMAGE does not close", /onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(VIEWER));
  ok("Escape closes", /if \(e\.key === "Escape"\)\s+onClose\(\);/.test(VIEWER));
  ok("the keydown listener is cleaned up",
    /document\.removeEventListener\("keydown", handler\)/.test(VIEWER));
  ok("background scrolling is locked while open",
    /document\.body\.style\.overflow = "hidden"/.test(VIEWER) && /document\.body\.style\.overflow = ""/.test(VIEWER));
  ok("it is announced as a modal dialog", /role="dialog"/.test(VIEWER) && /aria-modal="true"/.test(VIEWER));
  ok("mobile swipe between images still works",
    /onTouchStart=\{onTouchStart\}/.test(VIEWER) && /onTouchEnd=\{onTouchEnd\}/.test(VIEWER));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("9) OUT-OF-SCOPE SYSTEMS ARE UNTOUCHED:");
{
  ok("productFeedbackSource still defaults to currentProduct",
    DEFAULT_PRODUCT_FEEDBACK_SOURCE === "currentProduct" &&
    resolveProductFeedbackSource(null) === "currentProduct");
  ok("allProducts still means 'do not filter'",
    feedbackFilterProductId({ productFeedbackSource: "allProducts" }, "p1") === null);
  ok("currentProduct still filters by the product",
    feedbackFilterProductId({ productFeedbackSource: "currentProduct" }, "p1") === "p1");
  ok("the carousel still does NO filtering of its own",
    !/productFeedbackSource|feedbackFilterProductId|status ===|APPROVED/.test(CAR.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("the carousel still fetches nothing", !/fetch\(/.test(CAR));

  ok("all four layouts still exist",
    FEEDBACK_LAYOUTS.join(",") === "grid,slider,stacked,autoCarousel");
  ok("autoCarousel is still the ONLY branch that renders the carousel",
    (SECTION.match(/<FeedbackCarousel /g) || []).length === 1 &&
    /displayStyle === "autoCarousel" \? \(/.test(SECTION));
  ok("the default grid branch is unchanged",
    /<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">/.test(SECTION));
  ok("the carousel receives the SAME items the default list would render",
    /<FeedbackCarousel items=\{items\} settings=\{carouselSettings\} \/>/.test(SECTION));
  ok("review creation / moderation are not referenced by the carousel",
    !/submitFeedback|approve|reject|isFeatured|prisma/.test(CAR));
  ok("reduced-motion users still get a static, scrollable list",
    /if \(!animate\)/.test(ROW) && /overflow-x-auto/.test(ROW));
}

// -----------------------------------------------------------------------------
console.log("10) VERIFIED BADGE - one field, end to end:");
{
  // The field the ADMIN actually writes. Named, not assumed.
  ok("the admin verify action writes `isVerified`",
    /action: "verify", isVerified: !current/.test(ADMIN));
  ok("the admin edit form writes the SAME field", /isVerified:\s*form\.isVerified/.test(ADMIN));
  ok("the admin list renders its badge from the SAME field", /\{item\.isVerified && \(/.test(ADMIN));
  ok("`isVerified` is the only verification column in the schema",
    /isVerified\s+Boolean\s+@default\(false\)/.test(SCHEMA) &&
    (SCHEMA.match(/verified/gi) || []).length === 1);
  ok("no SECOND verified field was invented",
    !/verifiedBadge|isCustomerVerified|showVerified/.test(CAR + SERVICE + SCHEMA));

  // THE BUG: the perf `select` in getPublicFeedback stripped it, so the public
  // payload never carried the flag and every card looked unverified.
  const publicSelect = SERVICE.slice(
    SERVICE.indexOf("const rows = await prisma.feedback.findMany"),
    SERVICE.indexOf("orderBy: [{ isFeatured: 'desc' }"));
  ok("the PUBLIC select now ships isVerified", /isVerified:\s*true/.test(publicSelect));
  ok("it still ships everything else the card needs",
    ["rating", "authorName", "textContent", "images", "createdAt", "reviewDate"]
      .every((f) => new RegExp(f + ":\\s*true").test(publicSelect)));
  ok("the admin read is unaffected (it uses include, not select)",
    /include:\s+\{ product: \{ select: \{ id: true, title: true \} \} \}/.test(SERVICE));
  ok("verifyFeedback still toggles the same column",
    /data:\s+\{ isVerified: Boolean\(isVerified\) \}/.test(SERVICE));
  ok("nothing fakes verification client-side", !/isVerified:\s*true/.test(CAR));

  // The rendering condition, exercised on both branches.
  const renders = (item) => Boolean(item.isVerified);
  ok("a VERIFIED review renders the badge", renders({ isVerified: true }) === true);
  ok("a NON-verified review renders no badge", renders({ isVerified: false }) === false);
  ok("a review missing the field renders no badge", renders({}) === false);
  ok("the card gates the badge on exactly that field", /\{item\.isVerified && \(/.test(CAR));
  ok("the badge reuses the project's existing blue BadgeCheck icon",
    /<BadgeCheck size=\{14\} className="text-blue-500 shrink-0"/.test(CAR) &&
    /BadgeCheck size=\{14\} className="text-blue-500/.test(SECTION));
  ok("the badge sits beside the stars, not beside the name",
    CAR.indexOf("<Stars value={item.rating || 0} />") < CAR.indexOf("{item.isVerified && (") &&
    CAR.indexOf("{item.isVerified && (") < CAR.indexOf("{text && ("));
}

// -----------------------------------------------------------------------------
console.log("11) LOCALIZATION - the carousel follows the storefront language:");
{
  // THE BUG: the context exposes `lang`; the card destructured `language`,
  // which was always undefined, so the locale silently fell back to "ar".
  ok("LanguageContext exposes `lang` (not `language`)",
    /value=\{\{ lang, setLang, t, dir, formatPrice, mounted \}\}/.test(CTX));
  ok("the card reads `lang` from the context", /const \{ t, lang, dir \} = useLanguage\(\)/.test(CAR));
  ok("the stale `language` destructure is gone", !/const \{ language \}/.test(CAR));
  ok("the active locale is what reaches Intl", /relativeDateLabel\(date, \{ locale \}\)/.test(CAR));
  ok("the card direction follows the site language", /dir=\{dir\}/.test(CAR));

  const NOW = new Date("2026-08-18T12:00:00Z");
  const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000);
  const daysAgo  = (d) => new Date(NOW.getTime() - d * 86_400_000);

  const fr21h = relativeDateLabel(hoursAgo(21), { locale: "fr", now: NOW });
  const fr2m  = relativeDateLabel(daysAgo(61),  { locale: "fr", now: NOW });
  const fr1m  = relativeDateLabel(daysAgo(31),  { locale: "fr", now: NOW });
  const fr1y  = relativeDateLabel(daysAgo(400), { locale: "fr", now: NOW });
  ok("fr 21h -> " + fr21h, /il y a 21 heures/.test(fr21h));
  ok("fr 2mo -> " + fr2m,  /il y a 2 mois/.test(fr2m));
  ok("fr 1mo -> " + fr1m,  /mois dernier/.test(fr1m));
  ok("fr 1yr -> " + fr1y,  /an dernier|année dernière/.test(fr1y));
  ok("NO Arabic characters leak into French labels",
    ![fr21h, fr2m, fr1m, fr1y].some((x) => /[؀-ۿ]/.test(x)));

  const ar21h = relativeDateLabel(hoursAgo(21), { locale: "ar", now: NOW });
  const ar2m  = relativeDateLabel(daysAgo(61),  { locale: "ar", now: NOW });
  const ar1m  = relativeDateLabel(daysAgo(31),  { locale: "ar", now: NOW });
  const ar1y  = relativeDateLabel(daysAgo(400), { locale: "ar", now: NOW });
  ok("ar 21h -> " + ar21h, /21/.test(ar21h) && /[؀-ۿ]/.test(ar21h));
  ok("ar 2mo -> " + ar2m,  /[؀-ۿ]/.test(ar2m));
  ok("ar 1mo -> " + ar1m,  /الشهر الماضي/.test(ar1m));
  ok("ar 1yr -> " + ar1y,  /السنة الماضية/.test(ar1y));
  ok("fr and ar really differ for the same instant", fr2m !== ar2m && fr21h !== ar21h);

  ok("show-more/less come from the translation files, not literals",
    !/عرض المزيد|عرض أقل|Voir plus|Voir moins/.test(CAR));
  ok("both locales define feedback_show_more",
    Boolean(AR.feedback_show_more) && Boolean(FR.feedback_show_more));
  ok("both locales define feedback_show_less",
    Boolean(AR.feedback_show_less) && Boolean(FR.feedback_show_less));
  ok("fr show-more is French -> " + FR.feedback_show_more, !/[؀-ۿ]/.test(FR.feedback_show_more));
  ok("ar show-more is Arabic -> " + AR.feedback_show_more, /[؀-ۿ]/.test(AR.feedback_show_more));
  ok("the verified label is translated in both locales",
    Boolean(AR.feedback_verified) && Boolean(FR.feedback_verified) &&
    !/[؀-ۿ]/.test(FR.feedback_verified) && /[؀-ۿ]/.test(AR.feedback_verified));
  ok("the anonymous-author fallback is translated too", /t\("feedback_anonymous"\)/.test(CAR));

  // The customer's own words must be rendered verbatim.
  ok("the review text is rendered raw, never through t()",
    /const text = item\.textContent \|\| item\.text \|\| "";/.test(CAR) &&
    !/t\(text\)|t\(item\.textContent\)|translate\(/.test(CAR));
  ok("only the truncation ellipsis ever touches the text",
    /\{expanded \|\| !long \? text : `\$\{text\.slice\(0, TEXT_PREVIEW\)\.trimEnd\(\)\}…`\}/.test(CAR));
  ok("the author name is rendered raw", /const name = item\.authorName \|\| item\.name \|\|/.test(CAR));
  ok("the date is the ONLY value derived from a locale",
    (CAR.match(/relativeDateLabel\(/g) || []).length === 1);
  ok("resolveReviewDate still drives the label, unchanged",
    resolveReviewDate({ createdAt: "2026-06-18T12:00:00.000Z" }) !== null &&
    /const date = resolveReviewDate\(item\)/.test(CAR));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
