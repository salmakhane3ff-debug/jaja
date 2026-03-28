import { notFound } from "next/navigation";
import { fetchProductById } from "@/lib/data/products";
import ProductPageClient from "./ProductPageClient";

export default async function Page({ params }) {
  const { slug } = await params;
  const product = await fetchProductById(slug);
  if (!product) notFound();
  return <ProductPageClient product={product} />;
}
