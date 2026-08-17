"use client";

/**
 * FeedbackCarousel — "سلايدر متحرك تلقائياً" display style.
 *
 * PRESENTATION ONLY. It receives whatever feedback array the existing system
 * already fetched (product page → `productFeedbackSource` filtering, homepage →
 * its own query) and never fetches, filters or moderates anything itself.
 *
 * MOTION: a pure CSS marquee. Each row is an INDEPENDENT viewport + track (never
 * one tall shared track, which is what produced the huge vertical gaps). The
 * group is rendered twice and the track animates `translate3d(0 → -50%)`.
 *
 * The gap lives on each CARD (`margin-inline-end`), NOT on the track: with a
 * track `gap` the 2N flat siblings only have 2N−1 gaps, so `-50%` fell exactly
 * half a gap short of the duplicate and the seam jumped every loop. Giving each
 * card its own trailing margin makes one card occupy `W + G`, so the track is
 * `2N·(W + G)` and `-50%` is exactly one period — see the geometry note in
 * lib/feedbackCarousel.js.
 *
 * The track is `dir="ltr"` so the seam is deterministic (transforms are not
 * direction-aware) while each CARD stays `dir="rtl"` for Arabic. The translate
 * is negative, so cards always enter from the RIGHT and leave to the LEFT.
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
  normalizeCarouselSettings, carouselDurationSec, splitIntoRows, shouldAnimate,
  repeatToFill, CARD_GAP_CLASS,
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

function MarqueeRow({ items, durationSec, animate, paused, shadow }) {
  // Density: a 1–3 review store would otherwise animate a mostly-empty track.
  // Visual repetition only — the review data itself is untouched.
  const group = useMemo(() => repeatToFill(items), [items]);

  // `items-start` is essential: flex would otherwise stretch every card to the
  // tallest one, so a single expanded/image-heavy review inflated the whole row.
  const trackBase = "flex items-start w-max";

  if (!animate) {
    // Reduced motion / single card: a normal swipeable row, no animation.
    return (
      <div className="overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
        <div dir="ltr" className={trackBase}>
          {items.map((it, i) => <ReviewCard key={it._id || it.id || i} item={it} shadow={shadow} />)}
        </div>
      </div>
    );
  }

  // Rendered inline (not as a nested component): a nested definition would get a
  // fresh identity on every pause/resume render, remounting the cards and
  // resetting any expanded "عرض المزيد" state.
  const renderGroup = (duplicate) => (
    <div dir="ltr" className="flex items-start w-max flex-none" aria-hidden={duplicate || undefined}>
      {group.map((it, i) => (
        <ReviewCard key={`${it._id || it.id || "i"}-${i}`} item={it} shadow={shadow} duplicate={duplicate} />
      ))}
    </div>
  );

  return (
    // Only this element clips the moving overflow.
    <div className="overflow-hidden">
      <div
        dir="ltr"
        className={`${trackBase} will-change-transform`}
        style={{
          animation: `fbMarquee ${durationSec}s linear infinite`,
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
            durationSec={carouselDurationSec(cfg.speed, repeatToFill(rowItems).length, i)}
            animate={shouldAnimate({ cardCount: repeatToFill(rowItems).length, reducedMotion: reduced })}
            paused={tabHidden || interacting}
          />
        ))}
      </div>
      <style>{`
        @keyframes fbMarquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="fbMarquee"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
