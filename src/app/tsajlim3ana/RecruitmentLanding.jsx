"use client";

/**
 * src/app/tsajlim3ana/RecruitmentLanding.jsx
 * Public affiliate-recruitment landing (Moroccan Darija, RTL, mobile-first).
 * CTAs: "تسجيل الدخول" → /affiliate/dashboard; join CTAs → support WhatsApp
 * (resolved server-side into `whatsappLink`, disabled gracefully when missing).
 * Sections follow the required order; competition + live feed reuse public
 * cached endpoints; stats come from the server (real, cached). No guaranteed
 * income; UGC/team framed as optional/level-based.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import {
  GraduationCap, Truck, ShoppingBag, Wallet, Phone, Video, Gift, Megaphone,
  CheckCircle, LayoutDashboard, LineChart, Headphones, ChevronLeft, ChevronRight,
  Star, ChevronDown, MessageCircle, Users, Trophy, PackageCheck, X,
} from "lucide-react";
import { publicVideos, publicTestimonials, maskSurname } from "@/lib/recruitmentCta";

function track(event) {
  try {
    fetch("/api/tsajlim3ana/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source: "tsajlim3ana" }), keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Fire `event` once when the ref enters the viewport.
function useSectionView(event) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { track(event); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [event]);
  return ref;
}

// Count-up on viewport entry; respects prefers-reduced-motion.
function useCountUp(target) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (reduce || target <= 0) { setVal(target); return; }
      const dur = 1200, t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return [val, ref];
}

// Tween a number smoothly from its PREVIOUS displayed value to the latest value
// received (used by the live competition board). No random/independent motion —
// it only ever animates between the old value and the new API value.
function CountUpNumber({ value }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (from === to) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(to); fromRef.current = to; return; }
    const dur = 800, t0 = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <>{display.toLocaleString("en-US")}</>;
}

const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-lg shadow-rose-200 transition-all";

function JoinCta({ link, event = "hero_whatsapp_click", className = "", children }) {
  if (!link) {
    return (
      <div className="text-center">
        <button disabled className={`opacity-60 cursor-not-allowed ${className}`}>{children}</button>
        <p className="text-xs text-gray-400 mt-2">رقم الدعم غير متوفر حالياً.</p>
      </div>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => track(event)} className={className}>
      {children}
    </a>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      <span className="h-0.5 w-8 bg-rose-300 rounded-full" />
      <h2 className="text-xl sm:text-2xl font-black text-gray-900 text-center">{children}</h2>
      <span className="h-0.5 w-8 bg-rose-300 rounded-full" />
    </div>
  );
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <button onClick={() => { setOpen((o) => !o); if (!open) track("faq_open"); }} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right">
        <span className="text-sm font-bold text-gray-800">{q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm text-gray-500 leading-relaxed">{a}</p>}
    </div>
  );
}

// ── Video slider (TikTok-style) ────────────────────────────────────────────────
function VideoSlider({ videos }) {
  const scrollerRef = useRef(null);
  const videoRefs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) { e.target.play?.().catch(() => {}); track("video_play"); }
        else e.target.pause?.();
      }
    }, { threshold: [0, 0.6, 1] });
    videoRefs.current.forEach((v) => v && io.observe(v));
    return () => io.disconnect();
  }, [videos]);
  const scrollBy = (dir) => scrollerRef.current?.scrollBy({ left: dir * Math.round(scrollerRef.current.clientWidth * 0.75), behavior: "smooth" });
  return (
    <div className="relative">
      <button onClick={() => scrollBy(-1)} aria-label="السابق" className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-gray-600 hover:text-rose-500"><ChevronRight className="w-5 h-5" /></button>
      <button onClick={() => scrollBy(1)} aria-label="التالي" className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-gray-600 hover:text-rose-500"><ChevronLeft className="w-5 h-5" /></button>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 px-1" style={{ scrollbarWidth: "none" }}>
        {videos.map((v, i) => (
          <div key={v.id} className="snap-center shrink-0 w-[72%] sm:w-56 rounded-2xl overflow-hidden bg-black relative">
            <video ref={(el) => (videoRefs.current[i] = el)} src={v.url} poster={v.thumbnail || undefined}
              className="w-full aspect-[9/16] object-cover" muted loop playsInline preload="none" />
            {v.title && <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2.5"><p className="text-white text-xs font-semibold line-clamp-1">{v.title}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Competition ────────────────────────────────────────────────────────────────
// Reuses the EXACT same source as the dashboard / admin demo competition
// (/api/demo/leaderboard → demoService). When the admin "Simuler activité" runs,
// that source is updated + its cache invalidated, so polling here reflects the
// growing simulated totals automatically — no separate/random client-side data.
// Polling runs only while the section is on screen AND the tab is visible, with
// an in-flight guard so requests never overlap.
const COMPETITION_POLL_MS = 7000;

function CompetitionSection({ whatsappLink }) {
  const ref = useSectionView("competition_section_view");
  const [state, setState] = useState({ loading: true, rows: [], error: false });
  const inViewRef  = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef   = useRef(null);

  const fetchBoard = useCallback(async () => {
    if (inFlightRef.current) return;            // avoid duplicate/overlapping polls
    inFlightRef.current = true;
    try {
      const r = await fetch("/api/demo/leaderboard?limit=10", { cache: "no-store" });
      const d = await r.json();
      const rows = Array.isArray(d?.leaderboard) ? d.leaderboard : [];
      setState({ loading: false, rows, error: false });
    } catch {
      setState((s) => ({ loading: false, rows: s.rows, error: true }));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = () => {
      if (timerRef.current) return;
      fetchBoard();                             // immediate refresh on (re)activation
      timerRef.current = setInterval(fetchBoard, COMPETITION_POLL_MS);
    };
    const stop = () => { clearInterval(timerRef.current); timerRef.current = null; };
    const evaluate = () => {
      const active = inViewRef.current && document.visibilityState === "visible";
      if (active) start(); else stop();         // pause off-screen or when tab hidden
    };

    const io = new IntersectionObserver((entries) => {
      inViewRef.current = entries.some((e) => e.isIntersecting);
      evaluate();
    }, { threshold: 0.15 });
    io.observe(el);
    document.addEventListener("visibilitychange", evaluate);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", evaluate);
      stop();
    };
  }, [fetchBoard, ref]);

  return (
    <section ref={ref} id="competition" className="bg-rose-50/50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>المنافسة ديال هاد الشهر</SectionTitle>
        <p className="text-center text-sm text-gray-500 -mt-3 mb-6">شوفي شكون متصدر الترتيب هاد الشهر وخليها تكون دافع ليك باش توصلي حتى نتي للقمة.</p>
        {state.loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : state.rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400">المنافسة الشهرية مفتوحة دابا.</p>
        ) : (
          <div className="max-w-md mx-auto space-y-2">
            {state.rows.slice(0, 10).map((m, i) => {
              const rank = m.rank || i + 1;
              return (
                <div key={m.id || i} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-2.5 transition-all duration-500">
                  <span className={`w-6 text-center font-black ${rank <= 3 ? "text-rose-500" : "text-gray-400"}`}>{rank}</span>
                  {m.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" loading="lazy" />
                    : <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: m.avatarColor || "#f43f5e" }}>{(m.name || "?")[0]}</span>}
                  <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{maskSurname(m.name)}</span>
                  <span className="text-xs text-gray-500 shrink-0 tabular-nums"><CountUpNumber value={m.totalOrders ?? 0} /> طلب</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="text-center mt-6">
          <JoinCta link={whatsappLink} event="competition_section_view" className={CTA_PRIMARY}>بداي دابا وطلعي فالترتيب</JoinCta>
        </div>
      </div>
    </section>
  );
}

// ── Statistics (real, animated on view) ────────────────────────────────────────
function StatItem({ value, label }) {
  const [v, ref] = useCountUp(value);
  return (
    <div ref={ref} className="rounded-2xl bg-white border border-gray-100 p-5 text-center">
      <p className="text-3xl font-black text-rose-500">{v.toLocaleString("fr-FR")}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
function StatisticsSection({ stats, counters }) {
  const items = [
    { key: "members",          label: "عضوة مسجلة",        value: stats?.members },
    { key: "activeAffiliates", label: "مسوّقة نشيطة",       value: stats?.activeAffiliates },
    { key: "confirmedOrders",  label: "طلب مؤكد",          value: stats?.confirmedOrders },
    { key: "successfulOrders", label: "طلب ناجح",          value: stats?.successfulOrders },
    { key: "ugcApproved",      label: "فيديو UGC مقبول",   value: stats?.ugcApproved },
    { key: "activeTeams",      label: "فريق نشيط",         value: stats?.activeTeams },
  ].filter((s) => counters?.[s.key] && Number(s.value) > 0); // real, non-zero, admin-enabled
  if (!items.length) return null;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10">
      <SectionTitle>منصة كتجمع مسوقين من مختلف المدن</SectionTitle>
      <div className={`grid grid-cols-2 ${items.length >= 3 ? "sm:grid-cols-3" : ""} gap-3`}>
        {items.map((s) => <StatItem key={s.key} value={Number(s.value)} label={s.label} />)}
      </div>
    </section>
  );
}

// ── Live activity feed (floating) ──────────────────────────────────────────────
const FEED_DISMISS_KEY = "tsajlim_feed_dismissed";
function LiveFeed() {
  const [data, setData] = useState(null); // { enabled, events, config }
  const [current, setCurrent] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const idxRef = useRef(-1);
  const timers = useRef([]);

  useEffect(() => {
    try { if (sessionStorage.getItem(FEED_DISMISS_KEY) === "1") { setDismissed(true); return; } } catch {}
    fetch("/api/tsajlim3ana/live-feed").then((r) => r.json()).then((d) => setData(d)).catch(() => {});
  }, []);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    if (dismissed || !data?.enabled || !data.events?.length) return;
    const cfg = data.config || {};
    const minMs = Math.max(15, cfg.minInterval || 30) * 1000;
    const maxMs = Math.max(minMs, (cfg.maxInterval || 60) * 1000);
    const showMs = Math.max(2, cfg.displayDuration || 5) * 1000;
    let stopped = false;

    const showNext = () => {
      if (stopped || document.visibilityState === "hidden") { // paused when tab inactive
        timers.current.push(setTimeout(showNext, 5000));
        return;
      }
      let next = idxRef.current;
      // never repeat the same notification consecutively
      if (data.events.length === 1) next = 0;
      else { do { next = Math.floor(Math.random() * data.events.length); } while (next === idxRef.current); }
      idxRef.current = next;
      setCurrent(data.events[next]);
      track("live_feed_impression");
      timers.current.push(setTimeout(() => {
        setCurrent(null);
        const gap = minMs + Math.random() * (maxMs - minMs);
        timers.current.push(setTimeout(showNext, gap));
      }, showMs));
    };

    // first notification only after ≥10s
    timers.current.push(setTimeout(showNext, Math.max(10000, minMs)));
    const onVis = () => {}; // showNext already checks visibility each cycle
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearTimers(); document.removeEventListener("visibilitychange", onVis); };
  }, [data, dismissed]);

  const close = () => {
    setDismissed(true); setCurrent(null); clearTimers();
    try { sessionStorage.setItem(FEED_DISMISS_KEY, "1"); } catch {}
    track("live_feed_close");
  };

  if (dismissed || !current) return null;
  return (
    <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-sm w-full bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3 animate-[fadeInUp_0.35s_ease]">
        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 shrink-0"><Trophy className="w-4 h-4" /></div>
        <p className="flex-1 text-xs font-semibold text-gray-700 leading-snug">{current.text}</p>
        <button onClick={close} aria-label="إغلاق" className="text-gray-300 hover:text-gray-500 shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────
export default function RecruitmentLanding({ config, whatsappLink, stats, teamRange }) {
  const videos = publicVideos(config);
  const testimonials = publicTestimonials(config);
  const { hero, confirmation, ugc, team, competition, statistics } = config;

  const confRef = useSectionView("confirmation_section_view");
  const ugcRef = useSectionView("ugc_section_view");
  const teamRef = useSectionView("team_section_view");
  const testiRef = useSectionView("testimonial_view");

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-white text-gray-900">
      {/* 1. Sticky header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <span className="font-black text-rose-500 tracking-tight">COD <span className="text-gray-900">AFFILIÉ</span></span>
          <nav className="hidden md:flex items-center gap-5 text-sm text-gray-600">
            <a href="#hero" className="hover:text-rose-500">الرئيسية</a>
            <a href="#how" className="hover:text-rose-500">كيفاش تخدمي معانا؟</a>
            <a href="#competition" className="hover:text-rose-500">المنافسة</a>
            <a href="#faq" className="hover:text-rose-500">الأسئلة الشائعة</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/affiliate/dashboard" onClick={() => track("header_login_click")}
              className="text-sm font-semibold text-gray-700 hover:text-rose-500 px-2">تسجيل الدخول</a>
            <JoinCta link={whatsappLink} className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-sm">تسجلي معانا</JoinCta>
          </div>
        </div>
      </header>

      {/* 2. Hero */}
      <section id="hero" className="bg-gradient-to-b from-rose-50 to-white">
        <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">{hero.title}</h1>
            <p className="text-gray-600 mt-3 leading-relaxed">{hero.subtitle}</p>
            <div className="grid grid-cols-5 gap-1.5 my-6 max-w-md">
              {[
                { icon: GraduationCap, t: "بدون رأس مال" },
                { icon: ShoppingBag, t: "بدون شراء" },
                { icon: PackageCheck, t: "بدون تخزين" },
                { icon: Truck, t: "بدون توصيل" },
                { icon: Wallet, t: "بدون تجربة" },
              ].map(({ icon: I, t }) => (
                <div key={t} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-500"><I className="w-4 h-4" /></div>
                  <span className="text-[10px] text-gray-600 font-medium leading-tight">{t}</span>
                </div>
              ))}
            </div>
            <JoinCta link={whatsappLink} className={CTA_PRIMARY}>تسجلي معانا</JoinCta>
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> التسجيل مجاني 100% وآمن</p>
          </div>
          <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-rose-100/60">
            {hero.image ? (
              <Image src={hero.image} alt="ربحي من الدار" fill priority unoptimized sizes="(max-width:768px) 100vw, 480px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-rose-300"><Phone className="w-20 h-20" /></div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Strong clarification */}
      <section className="max-w-5xl mx-auto px-4 -mt-2">
        <div className="rounded-2xl bg-gray-900 text-white px-5 py-4 text-center">
          <p className="text-sm sm:text-base font-black">إحنا كنجيبو الطلبات، وإنتِ غير كتأكديها ✅</p>
          <p className="text-xs text-gray-300 mt-1">{confirmation.title}</p>
        </div>
      </section>

      {/* 4. Target audience */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>هاد الخدمة مناسبة ليك</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: "🏠", t: "ربة بيت" },
            { icon: "👶", t: "عندك أطفال" },
            { icon: "🎓", t: "طالبة" },
            { icon: "💁‍♀️", t: "ما خداماش" },
            { icon: "💰", t: "باغية دخل إضافي" },
          ].map(({ icon, t }) => (
            <div key={t} className="rounded-2xl border border-gray-100 bg-white p-4 text-center">
              <div className="text-3xl mb-2">{icon}</div>
              <p className="text-sm font-bold text-gray-800">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. How confirmation works */}
      <section id="how" ref={confRef} className="bg-rose-50/50">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>كيفاش خدمة تأكيد الطلبات؟</SectionTitle>
          <ol className="max-w-2xl mx-auto space-y-3">
            {[
              "الطلبات كتوصل مباشرة للوحة التحكم ديالك",
              "كتتاصلي بالزبون عبر الهاتف أو WhatsApp",
              "كتأكدي معلومات الطلب",
              "كتتابعي حالة الطلب",
              "كتربحي العمولة ديالك بعد نجاح الطلب حسب قواعد المنصة",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-sm text-gray-700">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 max-w-2xl mx-auto rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-amber-800">ما خاصكش تجيبي الزبناء بنفسك، وما خاصكش تديري الإعلانات.</p>
          </div>
        </div>
      </section>

      {/* 6. Benefits */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>علاش تخدمي معانا؟</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {confirmation.benefits.map((b, i) => {
            const Icon = [ShoppingBag, Users, Megaphone, PackageCheck, Truck, Headphones, LayoutDashboard, LineChart, CheckCircle][i % 9];
            return (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0"><Icon className="w-4 h-4" /></div>
                <p className="text-sm font-semibold text-gray-800">{b}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. UGC optional */}
      {ugc.enabled && (
        <section ref={ugcRef} className="bg-rose-50/50">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-rose-500 text-white text-xs font-black">UGC اختياري، ماشي إجباري</span>
            </div>
            <SectionTitle>{ugc.title}</SectionTitle>
            <p className="text-center text-sm text-gray-500 -mt-3 mb-6 max-w-2xl mx-auto">{ugc.description}</p>
            <div className="grid md:grid-cols-2 gap-4">
              <ol className="space-y-2">
                {[
                  "كتختاري منتج متوفر فالمنصة",
                  "كتصوري فيديو قصير مناسب لـ TikTok أو Reels",
                  "كترفعي الفيديو فصفحة UGC",
                  "الإدارة كتراجع الفيديو",
                  "منين الفيديو يجيب مبيعات، كتاخدي عمولة إضافية",
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-2.5">
                    <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="text-sm text-gray-700">{s}</span>
                  </li>
                ))}
              </ol>
              <div className="space-y-3">
                <div className="rounded-2xl bg-gray-900 text-white p-5 text-center">
                  <p className="text-xs opacity-70 mb-1">عمولة UGC على كل مبيعة جاية من الفيديو</p>
                  <p className="text-2xl font-black">من {ugc.minCommission} حتى {ugc.maxCommission} درهم</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-2xl bg-white border border-gray-100 p-3">
                    <p className="font-black text-gray-800 mb-1">تأكيد الطلبات</p>
                    <ul className="text-gray-500 space-y-1"><li>• ما خاصكش تصوري فيديو</li><li>• الطلبات كتوصل ليك</li><li>• كتربحي على الطلبات الناجحة</li></ul>
                  </div>
                  <div className="rounded-2xl bg-white border border-rose-100 p-3">
                    <p className="font-black text-rose-600 mb-1">UGC</p>
                    <ul className="text-gray-500 space-y-1"><li>• اختياري</li><li>• كتصوري فيديوهات</li><li>• عمولة إضافية على المبيعات</li></ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 8. Team building */}
      {team.enabled && (
        <section ref={teamRef} className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>{team.title}</SectionTitle>
          <p className="text-center text-sm text-gray-500 -mt-3 mb-6 max-w-2xl mx-auto">{team.description}</p>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-3"><Users className="w-5 h-5" /></div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• تقدري تعاوني أشخاص آخرين يسجلو معانا</li>
                <li>• تقدري تكوّني فريق وتطوّريه</li>
                <li>• أداء الفريق يقدر يجيب نسبة إضافية</li>
              </ul>
              {teamRange && (
                <p className="text-xs text-gray-700 mt-3 bg-rose-50 rounded-lg px-3 py-2 font-semibold">
                  عمولة الفريق كتكون ما بين {teamRange.min}% و{teamRange.max}% من الأرباح المؤهلة ديال أعضاء الفريق، حسب المستوى والقواعد المحددة من الإدارة.
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-5">
              <p className="text-xs font-black text-rose-600 mb-2">مثال توضيحي</p>
              <p className="text-sm text-gray-700 leading-relaxed">إلى كونتي فريق من 5 أشخاص وكان الفريق نشيط، تقدري تستافدي من عمولة إضافية حسب المستوى ديالك.</p>
              <p className="text-[11px] text-gray-400 mt-3">مثال توضيحي — النتائج كتختلف حسب نشاط الفريق</p>
            </div>
          </div>
        </section>
      )}

      {/* 9. Competition du mois */}
      {competition.enabled && <CompetitionSection whatsappLink={whatsappLink} />}

      {/* 10. Statistics */}
      {statistics.enabled && stats && <StatisticsSection stats={stats} counters={statistics.counters} />}

      {/* 11. Videos */}
      {videos.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>شوفي كيفاش كيخدمو البنات معانا</SectionTitle>
          <VideoSlider videos={videos} />
        </section>
      )}

      {/* 12. Testimonials */}
      {testimonials.length > 0 && (
        <section id="avis" ref={testiRef} className="bg-rose-50/50">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <SectionTitle>آراء البنات</SectionTitle>
            <div className="grid md:grid-cols-3 gap-3">
              {testimonials.map((t) => (
                <div key={t.id} className="rounded-2xl bg-white border border-gray-100 p-5">
                  <div className="flex gap-0.5 mb-2">{Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}</div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.text}</p>
                  {t.name && <p className="text-xs font-bold text-gray-800 mt-3">{t.name}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 13. FAQ */}
      <section id="faq" className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>أسئلة كتعاود بزاف</SectionTitle>
        <div className="max-w-2xl mx-auto space-y-2.5">
          {[
            { q: "خاصني شري المنتجات؟", a: "لا، المنتجات علينا. ما خاصك تشري والو." },
            { q: "خاصني نجيب الزبناء أو ندير إعلانات؟", a: "لا، إحنا كنجيبو الزبناء والطلبات. إنتِ غير كتأكدي." },
            { q: "خاصني نوصل الطلبات؟", a: "لا، التوصيل كيتكلف بيه الفريق ديالنا." },
            { q: "واش UGC إجباري؟", a: "لا، UGC اختياري باش تزيدي أرباحك فقط." },
            { q: "كيفاش نبدا؟", a: "دوسي على «تسجلي معانا» وتواصلي معانا فواتساب باش نوجهوك." },
          ].map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </section>

      {/* 14. Final CTA */}
      <section className="bg-rose-500">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <h2 className="text-2xl font-black text-white mb-2">مستعدة تبداي؟</h2>
          <p className="text-rose-50 text-sm mb-6 leading-relaxed">سجلي دابا وخدي أول خطوة باش تبني دخل إضافي من دارك.</p>
          <JoinCta link={whatsappLink} event="final_whatsapp_click"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-rose-600 rounded-2xl font-black text-base shadow-lg hover:bg-rose-50 active:scale-[0.98] transition-all">
            <MessageCircle className="w-5 h-5" /> تسجلي معانا الآن
          </JoinCta>
        </div>
      </section>

      {/* 15. Live activity feed (floating) */}
      <LiveFeed />
    </div>
  );
}
