/**
 * POST /api/tracking/click
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a new paid-traffic click event.
 *
 * Body: { clickId, sourceId?, campaignId?, subId?, zoneId?,
 *         cpc?, cpm?, connectionType? }
 *
 * Features:
 *   ✔ Lightweight UA parsing     (device, OS, browser, isMobile)
 *   ✔ IP extraction              (CF / X-Forwarded-For / X-Real-IP)
 *   ✔ IP-based geo enrichment    (country, city, ISP — via ip-api.com)
 *   ✔ Anti-fraud / bots          (regex UA detection)
 *   ✔ Anti-fraud / rate-limit    (same IP > 10 / hour)
 *   ✔ Anti-fraud / 5s dedup      (same IP + UA within 5 seconds)
 *   ✔ Cost capture               (cpc, cpm from body)
 *   ✔ Zone tracking              (zoneId)
 *   ✔ Dedup                      (unique clickId — silently ignored)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

// ── Bot UA detection ──────────────────────────────────────────────────────────
const BOT_RE = /bot|crawler|spider|slurp|bingbot|googlebot|yandex|baidu|duckduck|wget|curl|python-requests|axios|node-fetch|go-http|java\/|libwww|scrapy|headless|phantom|selenium|puppeteer|playwright/i;

function isBot(ua = "") { return BOT_RE.test(ua); }

// ── Lightweight UA parser ─────────────────────────────────────────────────────
function parseUA(ua = "") {
  const s = ua.toLowerCase();

  const isMobileDevice = /mobile|android|iphone|ipod|blackberry|windows phone/.test(s);
  const isTablet       = /tablet|ipad/.test(s);
  const deviceType     = isTablet ? "tablet" : isMobileDevice ? "mobile" : "desktop";

  let os = "unknown";
  if      (/windows nt 10/.test(s))       os = "Windows 10";
  else if (/windows nt 6\.3/.test(s))     os = "Windows 8.1";
  else if (/windows nt 6\.1/.test(s))     os = "Windows 7";
  else if (/windows/.test(s))             os = "Windows";
  else if (/android (\d+\.\d+)/.test(s)) { const m = s.match(/android (\d+\.\d+)/); os = m ? `Android ${m[1]}` : "Android"; }
  else if (/iphone os (\d+_\d+)/.test(s)) { const m = s.match(/iphone os (\d+_\d+)/); os = m ? `iOS ${m[1].replace("_", ".")}` : "iOS"; }
  else if (/ipad.*os (\d+_\d+)/.test(s))  { const m = s.match(/os (\d+_\d+)/); os = m ? `iPadOS ${m[1].replace("_", ".")}` : "iPadOS"; }
  else if (/mac os x/.test(s))            os = "macOS";
  else if (/linux/.test(s))               os = "Linux";

  let browser = "unknown";
  if      (/edg\//.test(s))        browser = "Edge";
  else if (/opr\/|opera/.test(s))  browser = "Opera";
  else if (/chrome\//.test(s))     browser = "Chrome";
  else if (/firefox\//.test(s))    browser = "Firefox";
  else if (/safari\//.test(s))     browser = "Safari";
  else if (/msie|trident/.test(s)) browser = "IE";

  return { device: deviceType, deviceType, os, browser, isMobile: isMobileDevice };
}

// ── IP extraction ─────────────────────────────────────────────────────────────
function extractIP(request) {
  return (
    request.headers.get("cf-connecting-ip")                       ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")                              ||
    "unknown"
  );
}

// ── IP geo enrichment via ip-api.com (free, no key needed) ───────────────────
async function enrichGeo(ip) {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("192.168") || ip.startsWith("10.")) {
    return { country: null, city: null, isp: null, operator: null };
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,city,isp,org`,
      { signal: AbortSignal.timeout(2000) }  // 2-second timeout
    );
    if (!res.ok) return { country: null, city: null, isp: null, operator: null };
    const d = await res.json();
    if (d.status !== "success") return { country: null, city: null, isp: null, operator: null };
    return {
      country:  d.country || null,
      city:     d.city    || null,
      isp:      d.isp     || null,
      operator: d.org     || null,
    };
  } catch {
    return { country: null, city: null, isp: null, operator: null };
  }
}

// ── Rate-limit: same IP > 10 clicks in last hour ──────────────────────────────
async function isRateLimited(ip) {
  if (!ip || ip === "unknown") return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.clickEvent.count({
    where: { ip, createdAt: { gte: oneHourAgo } },
  });
  return count >= 10;
}

// ── 5-second dedup: same IP + UA already clicked in last 5 seconds ───────────
async function isDuplicate5s(ip, userAgent) {
  if (!ip || ip === "unknown") return false;
  const fiveSecsAgo = new Date(Date.now() - 5000);
  const recent = await prisma.clickEvent.findFirst({
    where: { ip, userAgent, createdAt: { gte: fiveSecsAgo } },
    select: { id: true },
  });
  return !!recent;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { clickId, sourceId, campaignId, subId, zoneId, cpc, cpm, connectionType } = body;

    if (!clickId || typeof clickId !== "string") {
      return Response.json({ ok: false, error: "clickId required" }, { status: 400 });
    }

    // ── Dedup: same clickId already stored ────────────────────────────────────
    const exists = await prisma.clickEvent.findUnique({
      where: { clickId }, select: { id: true },
    });
    if (exists) return Response.json({ ok: true, duplicate: true });

    const ua                                  = request.headers.get("user-agent") || "";
    const { device, deviceType, os, browser, isMobile } = parseUA(ua);
    const ip                                  = extractIP(request);

    // ── Anti-fraud detection ──────────────────────────────────────────────────
    const botDetected  = isBot(ua);
    const [rateLimited, dup5s] = botDetected
      ? [false, false]
      : await Promise.all([isRateLimited(ip), isDuplicate5s(ip, ua)]);
    const isSuspicious = botDetected || rateLimited || dup5s;

    // ── Geo enrichment (async, best-effort) ───────────────────────────────────
    const geo = await enrichGeo(ip);

    await prisma.clickEvent.create({
      data: {
        clickId,
        sourceId:       sourceId       || null,
        campaignId:     campaignId     || null,
        subId:          subId          || null,
        zoneId:         zoneId         || null,
        ip,
        userAgent:      ua             || null,
        device,
        deviceType,
        os,
        browser,
        isMobile,
        isSuspicious,
        connectionType: connectionType || null,
        country:        geo.country,
        city:           geo.city,
        isp:            geo.isp,
        operator:       geo.operator,
        cpc:            cpc  != null ? parseFloat(cpc)  || null : null,
        cpm:            cpm  != null ? parseFloat(cpm)  || null : null,
      },
    });

    return Response.json({ ok: true, isSuspicious, geo });
  } catch (err) {
    console.error("[tracking/click]", err?.message ?? err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
