/**
 * /admin/products/[id]  →  edit mode at /admin/products/new?productId=[id]&isUpdate=true
 *
 * Redirects to the canonical plural product editor with edit-mode query params.
 */
import { redirect } from "next/navigation";

export default function AdminProductsEditRedirect({ params }) {
  redirect(`/admin/products/new?productId=${params.id}&isUpdate=true`);
}
