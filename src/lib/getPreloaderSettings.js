import { getSettings } from "./services/settingsService.js";
import { PRELOADER_DEFAULTS } from "./preloaderDefaults.js";

export { PRELOADER_DEFAULTS };

/** Server-side: reads DB directly — safe to call from layout.jsx */
export async function getPreloaderSettings() {
  try {
    const data = await getSettings("preloader");
    if (!data || Object.keys(data).length === 0) return PRELOADER_DEFAULTS;
    return { ...PRELOADER_DEFAULTS, ...data };
  } catch {
    return PRELOADER_DEFAULTS;
  }
}
