import { MetadataRoute } from "next";
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// Force dynamic rendering so the sitemap reads from DB at request time
export const dynamic = "force-dynamic";

const BASE_URL = "https://proprogiftvip.com";

function getPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ── Static pages ──────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL,                    lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/products`,      lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/blog`,          lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE_URL}/contact`,       lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/faqs`,          lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  const prisma = getPrisma();

  // ── Products ───────────────────────────────────────────────────────────────
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await prisma.product.findMany({
      where: { status: "Active" },
      select: { id: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
    productEntries = products.map((p) => ({
      url: `${BASE_URL}/products/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (err) {
    console.error("[sitemap] failed to fetch products:", err);
  }

  // ── Blog posts ─────────────────────────────────────────────────────────────
  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await prisma.post.findMany({
      where: { status: "Published" },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
    blogEntries = posts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] failed to fetch blog posts:", err);
  }

  await prisma.$disconnect();

  return [...staticPages, ...productEntries, ...blogEntries];
}
