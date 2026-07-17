import { notFound } from "next/navigation";
import { fetchProductById } from "@/lib/data/products";
import { absoluteUrl } from "@/lib/siteUrl";
import { buildProductDescription } from "@/lib/productMeta";
import Product from "./product";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) return {};

  const title = product.title || "Produit";
  // Was: `product.shortDescription || product.title || ""` — which handed Google a
  // meta description identical to the <title> whenever shortDescription was empty.
  // Google discards those and scrapes page text instead (that is where the footer
  // boilerplate in search results came from). Now: shortDescription → description
  // → generated sentence, always plain text and capped at 160 chars.
  const description = buildProductDescription(product);
  const image       = Array.isArray(product.images) && product.images.length > 0
    ? product.images[0]
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:      absoluteUrl(`/products/${id}`),
      siteName: "ProPro Gift VIP",
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
      locale: "fr_MA",
      type:   "website",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function Page({ params }) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) notFound();
  return <Product data={product} />;
}
