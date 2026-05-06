import { notFound } from "next/navigation";
import { fetchProductById } from "@/lib/data/products";
import Product from "./product";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) return {};

  const title       = product.title || "Produit";
  const description = product.shortDescription || product.title || "";
  const image       = Array.isArray(product.images) && product.images.length > 0
    ? product.images[0]
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:      `https://proprogiftvip.com/products/${id}`,
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
