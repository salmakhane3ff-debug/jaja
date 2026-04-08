import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Permanent HTTP redirects ───────────────────────────────────────────────
  // These fire at the infrastructure level (308 status) before any JavaScript
  // runs, so bots, scripts, curl, and old browser tabs all land on the correct
  // URL immediately. The React-level redirect() in each page file is a second
  // safety net for the rare case where the config redirect is bypassed.
  async redirects() {
    return [
      // ── Admin: singular → plural (permanent 308) ──────────────────────────
      // Old bookmarks / cached links pointing at /admin/product/* are
      // transparently forwarded to the new canonical /admin/products/* routes.
      {
        source:      "/admin/product",
        destination: "/admin/products",
        permanent:   true,
      },
      {
        source:      "/admin/product/new",
        destination: "/admin/products/new",
        permanent:   true,
      },
      {
        source:      "/admin/product/:id",
        destination: "/admin/products/new?productId=:id&isUpdate=true",
        permanent:   true,
      },

      // ── Storefront: singular → plural (permanent 308) ─────────────────────
      // Old /product/:slug links (e.g. from emails, social posts) redirect to
      // the canonical /products/:slug product page.
      {
        source:      "/product/:slug",
        destination: "/products/:slug",
        permanent:   true,
      },

      // ── API: singular → plural (permanent 308) ────────────────────────────
      // Any cached GET calls to /api/product are forwarded.
      // POST/PUT/DELETE should already use the new routes, but we cover GET.
      {
        source:      "/api/product",
        destination: "/api/products",
        permanent:   true,
      },
      {
        source:      "/api/product/:id",
        destination: "/api/products/:id",
        permanent:   true,
      },
    ];
  },

  // PERF: Enable gzip/brotli compression for all responses
  compress: true,

  // PERF: Strip console.log in production; keep console.error for runtime debugging
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  images: {
    // PERF: Serve AVIF first (60-70% smaller than JPEG), WebP as fallback
    formats: ["image/avif", "image/webp"],

    // PERF: Responsive image breakpoints aligned to Tailwind container widths
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // PERF: Replaced wildcard hostname "**" with explicit CDN domains (security + caching)
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/uploads/**",
      },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
    // PERF: REMOVED "unoptimized: true" — that single flag disabled ALL image optimization:
    //       no WebP/AVIF conversion, no responsive resizing, no compression.
    //       Removing it enables automatic format conversion and responsive serving.
  },

  // FIX: Pin the project root so Next.js doesn't pick up the stale
  // package-lock.json at C:\Users\jhon\ and mis-report the workspace root.
  outputFileTracingRoot: "C:/Users/jhon/Music/0000",

  experimental: {
    // PERF: Tree-shake heavy packages — only used symbols ship to the browser.
    // react-icons was shipping 683 KB (2 full icon sets); this reduces it to ~5-15 KB.
    // @heroui/react theme CSS was global; this limits it to used components only.
    optimizePackageImports: [
      "react-icons",
      "lucide-react",
      "@heroui/react",
      "framer-motion",
      "swiper",
    ],
  },
};

export default nextConfig;
