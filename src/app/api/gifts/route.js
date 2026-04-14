import prisma from "@/lib/prisma";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";

// Public — storefront reads gift thresholds to show free-gift offers
export async function GET() {
  try {
    const gifts = await prisma.gift.findMany({
      orderBy: { thresholdAmount: "asc" },
    });
    return Response.json(gifts);
  } catch (e) {
    console.error("GET /api/gifts:", e);
    return Response.json({ error: "Failed to fetch gifts" }, { status: 500 });
  }
}

async function _POST(req) {
  try {
    const body = await req.json();
    if (!body.productId || body.thresholdAmount == null) {
      return Response.json({ error: "productId and thresholdAmount are required" }, { status: 400 });
    }

    const threshold = parseFloat(body.thresholdAmount);
    if (!isFinite(threshold) || threshold < 0) {
      return Response.json({ error: "thresholdAmount must be a finite non-negative number" }, { status: 400 });
    }

    const gift = await prisma.gift.create({
      data: {
        productId:       body.productId,
        thresholdAmount: threshold,
        active:          body.active ?? true,
      },
    });
    return Response.json(gift, { status: 201 });
  } catch (e) {
    console.error("POST /api/gifts:", e);
    return Response.json({ error: "Failed to create gift" }, { status: 500 });
  }
}

export const POST = withAdminAuth(_POST);
