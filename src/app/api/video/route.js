/**
 * /api/video
 * ─────────────────────────────────────────────────────────────────────────────
 * Video library CRUD.  Stores records in the `videos` table and files in
 * /public/uploads/.
 *
 * GET              → list all video records  [{ _id, name, url }]
 * POST (multipart) → upload file → save to /public/uploads/ → DB record
 * DELETE { _id }   → remove DB record
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";

function mapVideo(row) {
  if (!row) return null;
  return { _id: row.id, name: row.name, url: row.url, createdAt: row.createdAt };
}

// ── GET → list all videos ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const rows = await prisma.video.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json(rows.map(mapVideo));
  } catch (err) {
    console.error("[/api/video GET]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST multipart/form-data → upload + save record ──────────────────────────

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer    = Buffer.from(await file.arrayBuffer());
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const fileName  = `${Date.now()}-${safeName}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const filePath  = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    const url = `/uploads/${fileName}`;
    const row = await prisma.video.create({ data: { name: file.name, url } });

    return Response.json(mapVideo(row), { status: 201 });
  } catch (err) {
    console.error("[/api/video POST]", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

// ── DELETE { _id } ─────────────────────────────────────────────────────────────

export async function DELETE(req) {
  try {
    const { _id, id } = await req.json();
    const videoId = _id || id;

    if (!videoId) {
      return Response.json({ error: "_id is required" }, { status: 400 });
    }

    await prisma.video.delete({ where: { id: videoId } });
    return Response.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }
    console.error("[/api/video DELETE]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
