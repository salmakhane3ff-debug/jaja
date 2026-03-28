import { notFound } from "next/navigation";
import { fetchProductById } from "@/lib/data/products";
import Product from "./product";

export default async function Page({ params }) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) notFound();
  return <Product data={product} />;
}
