import { redirect } from "next/navigation";

/**
 * /checkout → immediately redirect to Step 1
 */
export default function CheckoutPage() {
  redirect("/checkout/address");
}
