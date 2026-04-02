import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
