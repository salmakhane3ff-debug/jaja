import { headers } from "next/headers";

export default async function getDomainName() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";

  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("lvh.me");

  const protocol = isLocal ? "http" : "https";
  return `${protocol}://${host}`;
}
