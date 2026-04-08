"use client";

/**
 * Preloader — pure visual overlay.
 *
 * All timing and phase logic lives in PreloaderWrapper.
 * This component only handles the visual presentation.
 *
 * CSS animations are defined in globals.css — NOT inline —
 * to avoid server/client hydration mismatch from differing style content.
 *
 * Props
 * ──────
 * images     string[]                           1–3 image/GIF URLs from /public
 * animation  "bounce"|"pulse"|"fade"|"scale"    animation style for the image
 * fading     boolean                            triggers pl-fadeout CSS class
 * imgIndex   number                             which image is currently shown
 */

const ANIM_CLASS = {
  bounce: "animate-bounce",
  pulse:  "animate-pulse",
  fade:   "pl-fade-img",
  scale:  "pl-scale-img",
};

export default function Preloader({
  images    = [],
  animation = "bounce",
  fading    = false,
  imgIndex  = 0,
  text      = "",
}) {
  const animClass = ANIM_CLASS[animation] ?? ANIM_CLASS.bounce;

  return (
    /* Full-screen fixed overlay, always above all content */
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center${fading ? " pl-fadeout" : ""}`}
      role="status"
      aria-label="Chargement…"
    >
      {/* Frosted-glass background — covers 100% of viewport */}
      <div className="absolute inset-0 bg-white/95 backdrop-blur-sm" />

      {/* Decorative radial gradient (purely visual, pointer-events off) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(167,139,250,0.18) 0%, transparent 100%)",
        }}
      />

      {/* Image / GIF carousel ─────────────────────────────────────────────── */}
      <div className="relative z-10 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48">
        {images.map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt=""
            draggable={false}
            className={[
              "absolute inset-0 w-full h-full object-contain select-none",
              "transition-opacity duration-300",
              i === imgIndex
                ? `opacity-100 ${animClass}`
                : "opacity-0 pointer-events-none",
            ].join(" ")}
          />
        ))}
      </div>

      {/* Loading text ──────────────────────────────────────────────────────── */}
      {text ? (
        <p className="relative z-10 mt-6 text-sm font-medium text-gray-500 tracking-wide">
          {text}
        </p>
      ) : null}

      {/* Staggered loading dots ────────────────────────────────────────────── */}
      <div
        className="relative z-10 flex items-center gap-2 mt-8"
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pl-dot block w-2.5 h-2.5 rounded-full bg-purple-400"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
