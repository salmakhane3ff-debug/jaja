/**
 * GET /api/tsajlim3ana/live-feed
 * Public, read-only, cached feed of REAL, masked platform activity for the
 * recruitment landing. Admin controls live in the (admin-only) settings write
 * route — never exposed here. Returns neutral messages when there is no real
 * activity, and an empty/disabled payload when the admin has turned it off.
 */
import { getSettings } from "@/lib/services/settingsService";
import { normalizeRecruitmentConfig, LIVE_FEED_NEUTRAL } from "@/lib/recruitmentCta";
import { getLiveFeedMessages } from "@/lib/services/recruitmentData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = normalizeRecruitmentConfig(await getSettings("recruitment-landing").catch(() => null));
    const lf = config.liveFeed;

    if (!lf.enabled || !lf.showOnLanding) {
      return Response.json({ enabled: false, events: [], config: null });
    }

    let events = await getLiveFeedMessages(lf);
    if (!events.length) {
      // Neutral platform messages — never fabricate a named user's action.
      events = LIVE_FEED_NEUTRAL.map((text, i) => ({ id: `neutral-${i}`, type: "neutral", text }));
    }

    return Response.json(
      {
        enabled: true,
        events,
        config: {
          minInterval: lf.minInterval,
          maxInterval: lf.maxInterval,
          displayDuration: lf.displayDuration,
          order: lf.order,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } }
    );
  } catch (err) {
    console.error("tsajlim3ana/live-feed error:", err);
    return Response.json({ enabled: false, events: [], config: null });
  }
}
