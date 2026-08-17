"use client";

/**
 * FeedbackCarousel — "سلايدر متحرك تلقائياً" display style.
 *
 * PRESENTATION ONLY. It receives whatever feedback array the existing system
 * already fetched (product page → `productFeedbackSource` filtering, homepage →
 * its own query) and never fetches, filters or moderates anything itself.
 *
 * MOTION: a CSS marquee driven by a MEASURED distance. Each row is an
 * INDEPENDENT viewport + track (never one tall shared track). Group A holds the
 * full repeated sequence, group B is an exact aria-hidden duplicate placed
 * immediately after it, and the track animates
 *     translate3d(0 → calc(-1 * var(--marquee-distance)))
 * where `--marquee-distance` is group A's REAL rendered width, re-measured by a
 * ResizeObserver only when something actually resizes. CSS still performs the
 * animation — there is no per-frame JavaScript.
 *
 * Percentage transforms were tried twice and both failed: `-50%` is only exact
 * while every card renders at precisely the assumed width, which real cards
 * (vw rounding, scrollbars, image strips, fonts) do not guarantee. Any drift
 * reopened a blank stretch. Measuring removes the assumption entirely.
 *
 * DIRECTION: the marquee geometry is explicitly LTR at EVERY level — viewport,
 * track and both groups — regardless of the site language. This matters most on
 * the VIEWPORT, because an RTL overflow container anchors an oversized child to
 * its RIGHT edge and overflows LEFTWARD; on the Arabic storefront that left the
 * tail of group B in view at translateX(0) and walked the whole track out of the
 * viewport, producing an empty carousel. Only the CONTENT of each card is RTL.
 * The translate is negative, so cards always enter from the RIGHT and leave LEFT.
 *
 * Animation is paused (never torn down) when: the tab is hidden, the user
 * hovers/touches (optional), or `prefers-reduced-motion` is set — in which case
 * the rows render as a normal scrollable list instead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Star, BadgeCheck } from "lucide-react";
import formatDate from "@/utils/formatDate";
import { ImageStrip } from "@/components/FeedbackSection";
import {
  normalizeCarouselSettings, carouselDurationFromDistance, splitIntoRows, shouldAnimate,
  repeatToFill, requiredGroupCards, MIN_GROUP_CARDS, CARD_GAP_CLASS,
} from "@/lib/feedbackCarousel";

const TEXT_PREVIEW = 180;   // characters shown before "عرض المزيد"

function Stars({ value }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={13} className={value >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
      ))}
    </div>
  );
}

function Avatar({ name }) {
  const colors = [
    "from-blue-400 to-blue-600", "from-purple-400 to-purple-600",
    "from-green-400 to-green-600", "from-orange-400 to-orange-600",
    "from-pink-400 to-pink-600", "from-teal-400 to-teal-600",
  ];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function ReviewCard({ item, shadow, duplicate = false }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.textContent || item.text || "";
  const long = text.length > TEXT_PREVIEW;
  const images = Array.isArray(item.images) ? item.images : [];

  return (
    <article
      dir="rtl"
      className={`${CARD_GAP_CLASS} shrink-0 self-start w-[82vw] max-w-[340px] sm:w-[320px] min-h-[190px] flex flex-col rounded-[20px] bg-white border border-gray-100 p-4 ${shadow ? "shadow-[0_4px_20px_rgba(0,0,0,0.06)]" : ""}`}
    >
      <header className="flex items-center gap-2.5">
        <Avatar name={item.authorName || item.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900 truncate">{item.authorName || item.name || "—"}</p>
            {item.isVerified && <BadgeCheck size={14} className="text-blue-500 shrink-0" aria-label="موثّق" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Stars value={item.rating || 0} />
            {item.createdAt && (
              <time className="text-[11px] text-gray-400">{formatDate(item.createdAt)}</time>
            )}
          </div>
        </div>
      </header>

      {text && (
        <p className="text-[13px] leading-relaxed text-gray-600 mt-3 flex-1">
          {expanded || !long ? text : `${text.slice(0, TEXT_PREVIEW).trimEnd()}…`}
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              // The duplicate group is decorative: keep it out of the tab order
              // so "عرض المزيد" never produces a doubled keyboard stop.
              tabIndex={duplicate ? -1 : 0}
              aria-hidden={duplicate || undefined}
              className="ms-1 text-[12px] font-bold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
            >
              {expanded ? "عرض أقل" : "عرض المزيد"}
            </button>
          )}
        </p>
      )}

      {images.length > 0 && (
        <div className="mt-3">
          {/* Reuses the existing feedback lightbox — no duplicate viewer logic. */}
          <ImageStrip images={images} />
        </div>
      )}
    </article>
  );
}

function MarqueeRow({ items, speed, rowIndex, animate, paused, shadow, onDiagnostics }) {
  const viewportRef = useRef(null);
  const groupRef = useRef(null);
  // Measured geometry. `need` only ever grows, so re-measuring can never
  // oscillate (a bigger group would otherwise shrink the required count).
  const [geo, setGeo] = useState({ distance: 0, need: MIN_GROUP_CARDS });

  const group = useMemo(() => repeatToFill(items, geo.need), [items, geo.need]);

  useEffect(() => {
    const vp = viewportRef.current;
    const gp = groupRef.current;
    if (!vp || !gp || !animate) return;

    const measure = () => {
      const viewportW = vp.clientWidth || 0;
      const card = gp.firstElementChild;
      // Card outer width must include its gap margin, which offsetWidth omits.
      const cardBox = card ? card.getBoundingClientRect().width : 0;
      const cardMargin = card
        ? parseFloat(getComputedStyle(card).marginInlineEnd || "0") +
          parseFloat(getComputedStyle(card).marginInlineStart || "0")
        : 0;
      const cardOuter = cardBox + cardMargin;
      // Group A's own width already sums its children's outer widths.
      const distance = gp.getBoundingClientRect().width;

      setGeo((prev) => {
        const want = requiredGroupCards(viewportW, cardOuter);
        const need = Math.max(prev.need, want);        // grow-only, cannot oscillate
        // Only a MEANINGFUL width change may update state. Images loading change
        // card HEIGHT (cards have a fixed width), which fires the observer but
        // must never restart the animation.
        const widthChanged = Math.abs(prev.distance - distance) > 1;
        if (!widthChanged && need === prev.need) return prev;
        return { distance, need };
      });

      if (typeof onDiagnostics === "function") {
        onDiagnostics({ rowIndex, viewportW, cardOuter, distance, groupCards: gp.childElementCount });
      }

      // DEV-only geometry assertions. Silent in production builds.
      if (process.env.NODE_ENV !== "production") {
        const groupB = gp.nextElementSibling;
        if (groupB) {
          const a = gp.getBoundingClientRect();
          const b = groupB.getBoundingClientRect();
          if (Math.abs(b.left - a.right) > 1) {
            console.warn("[FeedbackCarousel] group B is not adjacent to group A", { gap: b.left - a.right });
          }
        }
        if (viewportW > 0 && distance < viewportW * 2) {
          console.warn("[FeedbackCarousel] group A narrower than 2 viewports", { distance, viewportW });
        }
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    ro.observe(gp);
    // Late-loading webfonts/images change card width after first paint.
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [animate, items, geo.need, rowIndex, onDiagnostics]);

  // `items-start` is essential: flex would otherwise stretch every card to the
  // tallest one, so a single expanded/image-heavy review inflated the whole row.
  // No `gap` anywhere on the track or groups: the card carries its own trailing
  // margin, so group A's width already includes the seam spacing.
  const trackBase = "flex flex-row items-start w-max min-w-max";

  if (!animate) {
    // Reduced motion / single card: a normal swipeable row, no animation.
    return (
      // Also an overflow container, so it is explicitly LTR too.
      <div dir="ltr" className="w-full overflow-x-auto overflow-y-hidden"
        style={{ direction: "ltr", scrollbarWidth: "none" }}>
        <div dir="ltr" style={{ direction: "ltr" }} className={trackBase}>
          {items.map((it, i) => <ReviewCard key={it._id || it.id || i} item={it} shadow={shadow} />)}
        </div>
      </div>
    );
  }

  // Keys are unique per PHYSICAL copy (`copy-index`), so a repeated review is
  // never collapsed or remounted by React reconciliation.
  const renderGroup = (duplicate) => (
    <div
      ref={duplicate ? undefined : groupRef}
      dir="ltr"
      style={{ direction: "ltr" }}
      className="flex flex-row items-start w-max min-w-max flex-none"
      aria-hidden={duplicate || undefined}
    >
      {group.map((it, i) => (
        <ReviewCard
          key={`${duplicate ? "b" : "a"}-${i}-${it._id || it.id || "x"}`}
          item={it}
          shadow={shadow}
          duplicate={duplicate}
        />
      ))}
    </div>
  );

  const distance = geo.distance;
  const durationSec = carouselDurationFromDistance(distance, speed, rowIndex);

  return (
    // Only this element clips the moving overflow.
    // dir="ltr" HERE is load-bearing, not cosmetic: this is the overflow
    // container, and an RTL overflow container anchors an oversized child to its
    // RIGHT edge and overflows LEFTWARD. On the Arabic storefront that put the
    // tail of group B in view at translateX(0) with group A off-screen left, so
    // translating negative walked the whole track out of the viewport -> empty.
    <div ref={viewportRef} dir="ltr" style={{ direction: "ltr" }} className="w-full overflow-hidden">
      <div
        dir="ltr"
        className={`${trackBase} flex-none will-change-transform`}
        style={{
          direction: "ltr",
          "--marquee-distance": `${distance}px`,
          // Wait for the first measurement so the row never animates against a
          // 0px distance (which would look like a frozen or empty track).
          animation: distance > 0 ? `fbMarquee ${durationSec}s linear infinite` : "none",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {renderGroup(false)}
        {renderGroup(true)}
      </div>
    </div>
  );
}

export default function FeedbackCarousel({ items = [], settings = null }) {
  const cfg = normalizeCarouselSettings(settings);
  const [reduced, setReduced] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const resumeTimer = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduced(!!mq?.matches);
    const onMq = (e) => setReduced(e.matches);
    mq?.addEventListener?.("change", onMq);

    // Pause while the tab is hidden — no offscreen compositing work.
    const onVis = () => setTabHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mq?.removeEventListener?.("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(resumeTimer.current);
    };
  }, []);

  const rows = splitIntoRows(items, cfg.rows);
  if (rows.length === 0) return null;   // empty feedback → render nothing

  const hold = () => { if (cfg.pauseOnInteract) { clearTimeout(resumeTimer.current); setInteracting(true); } };
  const release = () => {
    if (!cfg.pauseOnInteract) return;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteracting(false), 1200);
  };

  return (
    <div
      className="relative"
      onMouseEnter={hold}
      onMouseLeave={release}
      onTouchStart={hold}
      onTouchEnd={release}
    >
      <div className="flex flex-col gap-3 sm:gap-4">
        {rows.map((rowItems, i) => (
          <MarqueeRow
            key={i}
            items={rowItems}
            shadow={cfg.shadow}
            speed={cfg.speed}
            rowIndex={i}
            animate={shouldAnimate({ cardCount: repeatToFill(rowItems).length, reducedMotion: reduced })}
            paused={tabHidden || interacting}
          />
        ))}
      </div>
      <style>{`
        @keyframes fbMarquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(calc(-1 * var(--marquee-distance)), 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="fbMarquee"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
