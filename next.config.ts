import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // Also allow unoptimized local uploads served directly
    unoptimized: true,
  },
};

export default nextConfig;
