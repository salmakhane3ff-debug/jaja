"use client";

/**
 * src/app/tsajlim3ana/RecruitmentLanding.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Public affiliate-recruitment landing (Moroccan Darija, RTL, mobile-first).
 * CTAs:
 *   • "تسجيل الدخول" → /affiliate/dashboard (existing auth flow handles login).
 *   • "تسجلي معانا" / all join CTAs → the platform support WhatsApp (resolved on
 *     the server into `whatsappLink`); disabled gracefully when unavailable.
 * Content deliberately avoids guaranteed-income promises.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import {
  GraduationCap, Truck, ShoppingBag, Wallet, Phone, Video, Gift,
  CheckCircle, LayoutDashboard, LineChart, Headphones, ChevronLeft, ChevronRight,
  Star, ChevronDown, MessageCircle,
} from "lucide-react";
import { publicVideos, publicTestimonials } from "@/lib/recruitmentCta";

function track(event) {
  try {
    fetch("/api/tsajlim3ana/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source: "tsajlim3ana" }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// ── Join-us CTA (WhatsApp) — disabled gracefully when unavailable ──────────────
function JoinCta({ link, className = "", children }) {
  if (!link) {
    return (
      <div className="text-center">
        <button disabled className={`opacity-60 cursor-not-allowed ${className}`}>{children}</button>
        <p className="text-xs text-gray-400 mt-2">رقم الدعم غير متوفر حالياً.</p>
      </div>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => track("whatsapp_cta")} className={className}>
      {children}
    </a>
  );
}

const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-lg shadow-rose-200 transition-all";

// ── TikTok-style vertical video slider ────────────────────────────────────────
function VideoSlider({ videos }) {
  const scrollerRef = useRef(null);
  const videoRefs = useRef([]);

  // Only the most-visible video plays; the rest stay paused (muted autoplay).
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target;
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            v.play?.().catch(() => {});
          } else {
            v.pause?.();
          }
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    videoRefs.current.forEach((v) => v && io.observe(v));
    return () => io.disconnect();
  }, [videos]);

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.75), behavior: "smooth" });
  };

  return (
    <div className="relative">
      {/* Desktop arrows */}
      <button onClick={() => scrollBy(-1)} aria-label="السابق"
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-gray-600 hover:text-rose-500">
        <ChevronRight className="w-5 h-5" />
      </button>
      <button onClick={() => scrollBy(1)} aria-label="التالي"
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-gray-600 hover:text-rose-500">
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div ref={scrollerRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 px-1 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}>
        {videos.map((v, i) => (
          <div key={v.id} className="snap-center shrink-0 w-[72%] sm:w-56 rounded-2xl overflow-hidden bg-black relative">
            <video
              ref={(el) => (videoRefs.current[i] = el)}
              src={v.url}
              poster={v.thumbnail || undefined}
              className="w-full aspect-[9/16] object-cover"
              muted
              loop
              playsInline
              preload="none"
            />
            {v.title && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2.5">
                <p className="text-white text-xs font-semibold line-clamp-1">{v.title}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FAQ item ───────────────────────────────────────────────────────────────────
function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right">
        <span className="text-sm font-bold text-gray-800">{q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm text-gray-500 leading-relaxed">{a}</p>}
    </div>
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

export default function RecruitmentLanding({ config, whatsappLink }) {
  const videos = publicVideos(config);
  const testimonials = publicTestimonials(config);

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-white text-gray-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <span className="font-black text-rose-500 tracking-tight">COD <span className="text-gray-900">AFFILIÉ</span></span>
          <nav className="hidden md:flex items-center gap-5 text-sm text-gray-600">
            <a href="#hero" className="hover:text-rose-500">الرئيسية</a>
            <a href="#how" className="hover:text-rose-500">كيفاش تخدمي معانا؟</a>
            <a href="#avis" className="hover:text-rose-500">آراء البنات</a>
            <a href="#faq" className="hover:text-rose-500">الأسئلة الشائعة</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/affiliate/dashboard" onClick={() => track("login")}
              className="text-sm font-semibold text-gray-700 hover:text-rose-500 px-2">تسجيل الدخول</a>
            <JoinCta link={whatsappLink}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-sm">
              سجلي الآن مجاناً
            </JoinCta>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section id="hero" className="bg-gradient-to-b from-rose-50 to-white">
        <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">
              ربحي <span className="text-rose-500">فلوس</span> وأنتِ فالدار
            </h1>
            <p className="text-gray-600 mt-3 leading-relaxed">
              بدون رأس مال. بدون شراء المنتجات. بدون توصيل — غير من تيليفونك! 📱
            </p>
            <div className="grid grid-cols-4 gap-2 my-6 max-w-md">
              {[
                { icon: GraduationCap, t: "بدون رأس مال" },
                { icon: Truck, t: "بدون توصيل" },
                { icon: ShoppingBag, t: "بدون شراء" },
                { icon: Wallet, t: "بدون خبرة" },
              ].map(({ icon: I, t }) => (
                <div key={t} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-11 h-11 rounded-full bg-rose-100 flex items-center justify-center text-rose-500"><I className="w-5 h-5" /></div>
                  <span className="text-[11px] text-gray-600 font-medium">{t}</span>
                </div>
              ))}
            </div>
            <JoinCta link={whatsappLink} className={CTA_PRIMARY}>سجلي دابا مجاناً →</JoinCta>
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> التسجيل مجاني 100% وآمن</p>
          </div>
          <div className="hidden md:block">
            <div className="aspect-[4/3] rounded-3xl bg-rose-100/60 flex items-center justify-center text-rose-300">
              <Phone className="w-20 h-20" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Audience ── */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>هاد الخدمة مناسبة ليك إلا كنتِ</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: "🏠", t: "ربة بيت" },
            { icon: "🎓", t: "طالبة" },
            { icon: "💁‍♀️", t: "ما خداماش" },
            { icon: "💰", t: "باغية دخل إضافي" },
          ].map(({ icon, t }) => (
            <div key={t} className="rounded-2xl border border-gray-100 bg-white p-5 text-center">
              <div className="text-3xl mb-2">{icon}</div>
              <p className="text-sm font-bold text-gray-800">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How earnings work ── */}
      <section id="how" className="bg-rose-50/50">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>كيفاش كتربحي؟</SectionTitle>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-green-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600"><Phone className="w-5 h-5" /></div>
                <div><p className="text-[11px] text-gray-400 font-bold">الطريقة الأولى</p><p className="font-black text-gray-900">تأكيد الطلبات</p></div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">إلي شي واحد طلب منتج بالرابط ديالك، كتواصلي معاه باش تأكدي الطلب. كل طلبية كتأكد بنجاح كتاخدي عليها عمولة.</p>
            </div>
            <div className="rounded-2xl bg-white border border-rose-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-500"><Video className="w-5 h-5" /></div>
                <div><p className="text-[11px] text-gray-400 font-bold">الطريقة الثانية</p><p className="font-black text-gray-900">فيديوهات UGC</p></div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">صوري فيديوهات قصيرة بحال TikTok. كلما كان الفيديو ديالك زوين، كلما كتزيد فرص التوصيل والربح.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-rose-100/60 px-5 py-4 flex items-center gap-3">
            <Gift className="w-6 h-6 text-rose-500 shrink-0" />
            <p className="text-sm font-semibold text-gray-700">تقدري تجمعي بين الطريقتين باش تزيدي فرص الربح ديالك.</p>
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>علاش تخدمي معانا؟</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { icon: ShoppingBag, t: "المنتجات علينا", d: "ما عندكش علاش تشري شي حاجة" },
            { icon: Truck, t: "التوصيل علينا", d: "حنا كنوصلو للزبون" },
            { icon: LayoutDashboard, t: "لوحة تحكم خاصة", d: "تتبعي كلشي من مكان واحد" },
            { icon: LineChart, t: "تتبع الأرباح والطلبات", d: "شوفي مجهودك بالتفصيل" },
            { icon: Headphones, t: "دعم ومواكبة", d: "فريق كيعاونك خطوة بخطوة" },
            { icon: CheckCircle, t: "بداية سهلة", d: "بدون خبرة سابقة" },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col items-center text-center gap-2">
              <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center text-rose-500"><I className="w-5 h-5" /></div>
              <p className="text-sm font-bold text-gray-800">{t}</p>
              <p className="text-[11px] text-gray-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Earnings examples (illustrative) ── */}
      <section className="bg-rose-50/50">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>شحال يمكن تربحي؟</SectionTitle>
          <p className="text-center text-sm text-gray-500 -mt-3 mb-6">الأرباح كتختلف حسب المجهود وعدد الطلبات ديالك.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { orders: "5 طلبات", amount: "150", bg: "bg-amber-50", tone: "text-amber-700" },
              { orders: "10 طلبات", amount: "300", bg: "bg-rose-50", tone: "text-rose-600" },
              { orders: "30 طلبية", amount: "900", bg: "bg-green-50", tone: "text-green-700" },
            ].map((e) => (
              <div key={e.orders} className={`rounded-2xl ${e.bg} p-5 text-center`}>
                <p className="text-sm text-gray-500 font-semibold">{e.orders}</p>
                <p className={`text-3xl font-black ${e.tone} mt-1`}>{e.amount}</p>
                <p className="text-xs text-gray-500">درهم فالشهر (مثال تقريبي)</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-4 leading-relaxed">
            هادو أمثلة تقريبية للتوضيح فقط وماشي أرباح مضمونة. النتائج ماشي نفسها عند الجميع، وكلما خدمتي أكثر كتزيد فرص الربح.
          </p>
        </div>
      </section>

      {/* ── Video slider (only if admin added active videos) ── */}
      {videos.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <SectionTitle>شوفي كيفاش كيخدمو البنات معانا</SectionTitle>
          <VideoSlider videos={videos} />
        </section>
      )}

      {/* ── Testimonials (only real, admin-approved) ── */}
      {testimonials.length > 0 && (
        <section id="avis" className="bg-rose-50/50">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <SectionTitle>آراء البنات</SectionTitle>
            <div className="grid md:grid-cols-3 gap-3">
              {testimonials.map((t) => (
                <div key={t.id} className="rounded-2xl bg-white border border-gray-100 p-5">
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.text}</p>
                  {t.name && <p className="text-xs font-bold text-gray-800 mt-3">{t.name}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-5xl mx-auto px-4 py-10">
        <SectionTitle>أسئلة كتعاود بزاف</SectionTitle>
        <div className="max-w-2xl mx-auto space-y-2.5">
          {[
            { q: "خاصني شري المنتجات؟", a: "لا، المنتجات علينا. ما خاصك تشري والو." },
            { q: "خاصني نوصل الطلبات؟", a: "لا، التوصيل كيتكلف بيه الفريق ديالنا." },
            { q: "شحال هي العمولة؟", a: "العمولة كتبان فاللوحة ديالك وكتختلف حسب المنتج والطلبات." },
            { q: "شكون يقدر يبدا؟", a: "أي وحدة باغية دخل إضافي من الدار: ربة بيت، طالبة، أو اللي ما خداماش." },
            { q: "كيفاش نبدا؟", a: "دوسي على «سجلي معانا» وتواصلي معانا فواتساب باش نوجهوك." },
          ].map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-rose-500">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <h2 className="text-2xl font-black text-white mb-2">مستعدة تبداي؟</h2>
          <p className="text-rose-50 text-sm mb-6 leading-relaxed">
            سجلي دابا وخدي أول خطوة باش تبني دخل إضافي من دارك.
          </p>
          <JoinCta link={whatsappLink}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-rose-600 rounded-2xl font-black text-base shadow-lg hover:bg-rose-50 active:scale-[0.98] transition-all">
            <MessageCircle className="w-5 h-5" /> سجلي معانا الآن
          </JoinCta>
        </div>
      </section>
    </div>
  );
}
