/**
 * src/middleware.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js Edge Middleware — protects /admin routes.
 *
 * Security improvements over the legacy implementation:
 *   ✅ Verifies the JWT signature with `jose` (Edge Runtime compatible)
 *   ✅ Rejects expired tokens (was: any non-empty string was accepted)
 *   ✅ Checks role === 'ADMIN' (was: role never checked)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { jwtVerify }    from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('[middleware] JWT_SECRET environment variable is required but not set.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and its API endpoint
  if (pathname === '/login' || pathname.startsWith('/api/login')) {
    return NextResponse.next();
  }

  // Protect all /admin routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      console.log('[middleware] No token → redirect to /login');
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    try {
      // Cryptographically verify the JWT
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // Only ADMIN users may access /admin routes
      if (payload.role !== 'ADMIN') {
        console.warn('[middleware] Token valid but role is not ADMIN:', payload.role);
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }

      console.log('[middleware] JWT verified for', payload.email);
      return NextResponse.next();
    } catch (err) {
      console.warn('[middleware] JWT verification failed:', err.message);
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
