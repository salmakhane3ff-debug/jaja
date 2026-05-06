import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/login",
          "/affiliate/login",
          "/checkout/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://proprogiftvip.com/sitemap.xml",
  };
}
