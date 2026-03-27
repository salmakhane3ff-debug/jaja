import { getSettings } from "./services/settingsService.js";

// Server-side: reads DB directly — no HTTP self-fetch
export async function getStoreSettings() {
  try {
    const data = await getSettings("store");
    return data && Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    console.error("Failed to fetch store settings:", error);
    return null;
  }
}

// Client-side hook (unchanged)
export async function fetchStoreSettings() {
  try {
    const res = await fetch("/api/setting?type=store", {
      cache: "force-cache",
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    console.error("Failed to fetch store settings:", error);
    return null;
  }
}
