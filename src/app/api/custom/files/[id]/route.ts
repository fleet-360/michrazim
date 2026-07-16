import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/server/db";
import { getSession } from "@/server/auth";
import { CustomFile } from "@/server/models-custom";

/**
 * Streams a stored Custom-mode file to its owner. Server actions can't return
 * big payloads on Vercel (~4.5MB response cap) — downloads go through here.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  if (!mongoose.isValidObjectId(id)) return new NextResponse("not found", { status: 404 });
  await connectDB();
  const file = await CustomFile.findById(id);
  if (!file || String(file.userId) !== session.id) return new NextResponse("not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
