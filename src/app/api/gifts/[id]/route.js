import prisma from "@/lib/prisma";

export async function PUT(req, { params }) {
  try {
    const body = await req.json();
    const gift = await prisma.gift.update({
      where: { id: params.id },
      data: {
        productId: body.productId,
        thresholdAmount: parseFloat(body.thresholdAmount),
        active: body.active,
      },
    });
    return Response.json(gift);
  } catch (e) {
    console.error("PUT /api/gifts/[id]:", e);
    return Response.json({ error: "Failed to update gift" }, { status: 500 });
  }
}

export async function DELETE(_, { params }) {
  try {
    await prisma.gift.delete({ where: { id: params.id } });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/gifts/[id]:", e);
    return Response.json({ error: "Failed to delete gift" }, { status: 500 });
  }
}
