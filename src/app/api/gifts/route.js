import prisma from "@/lib/prisma";

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

export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.productId || !body.thresholdAmount) {
      return Response.json({ error: "productId and thresholdAmount are required" }, { status: 400 });
    }
    const gift = await prisma.gift.create({
      data: {
        productId: body.productId,
        thresholdAmount: parseFloat(body.thresholdAmount),
        active: body.active ?? true,
      },
    });
    return Response.json(gift, { status: 201 });
  } catch (e) {
    console.error("POST /api/gifts:", e);
    return Response.json({ error: "Failed to create gift" }, { status: 500 });
  }
}
