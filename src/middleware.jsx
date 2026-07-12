/**
 * src/middleware.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js Edge Middleware.
 *
 *  1. Protects /admin routes (JWT via `jose`, Edge-compatible; role === 'ADMIN').
 *  2. "Landing Page Only Mode" — when enabled in UI Control, redirects public
 *     storefront requests to a single configured landing page (temporary 307).
 *
 * The middleware runs in the Edge runtime and cannot query Prisma directly, so it
 * reads the landing config from the cached /api/landing-mode endpoint (short TTL,
 * module-scoped cache). It ALWAYS fails open — any fetch/logic error leaves the
 * site fully accessible. The pure decision logic lives in ./lib/landingMode.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { jwtVerify }    from 'jose';
import { evaluateLandingRedirect } from './lib/landingMode.js';

if (!process.env.JWT_SECRET) {
  throw new Error('[middleware] JWT_SECRET environment variable is required but not set.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

// ── Cached landing config (module scope; per Edge isolate) ────────────────────
const CFG_TTL_MS = 15_000;
let _cfgCache = { value: null, expires: 0 };

async function getLandingConfig(origin) {
  const now = Date.now();
  if (_cfgCache.value && now < _cfgCache.expires) return _cfgCache.value;
  try {
    const res = await fetch(`${origin}/api/landing-mode`, { headers: { 'x-mw-landing': '1' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const value = await res.json();
    _cfgCache = { value, expires: now + CFG_TTL_MS };
    return value;
  } catch (err) {
    // Fail open: cache a short "no config" so we don't hammer the endpoint.
    console.error('[middleware] landing config fetch failed (fail-open):', err?.message ?? err);
    _cfgCache = { value: null, expires: now + 5_000 };
    return null;
  }
}

export default async function middleware(request) {
  const { pathname, search, origin } = request.nextUrl;

  // Always allow the login page and its API endpoint.
  if (pathname === '/login' || pathname.startsWith('/api/login')) {
    return NextResponse.next();
  }

  // ── 1. Protect /admin routes (unchanged behavior) ──────────────────────────
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role !== 'ADMIN') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    } catch (err) {
      console.warn('[middleware] JWT verification failed:', err.message);
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // ── 2. Landing Page Only Mode (public routes) ──────────────────────────────
  try {
    const config = await getLandingConfig(origin);
    const decision = evaluateLandingRedirect({ pathname, search, origin, config });
    if (decision.failOpen) {
      console.error('[middleware] landing mode fail-open:', decision.reason);
    }
    if (decision.action === 'redirect') {
      return NextResponse.redirect(new URL(decision.destination, origin), decision.status || 307);
    }
  } catch (err) {
    // Never take the site down because of the landing feature.
    console.error('[middleware] landing mode error (fail-open):', err?.message ?? err);
  }

  return NextResponse.next();
}

export const config = {
  // Run on admin routes (JWT) + all public page routes (landing mode).
  // Exclude API, Next internals, uploads, and common static files.
  matcher: [
    '/((?!api|_next|uploads|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)',
  ],
};
