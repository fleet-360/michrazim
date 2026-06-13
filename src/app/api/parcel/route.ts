import { NextResponse } from "next/server";
import { fetchParcelByGushHelka } from "@/lib/data/govmap";

export const dynamic = "force-dynamic";

/** Client-side parcel lookup so the map renders instantly then upgrades. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gush = searchParams.get("gush") ?? "";
  const helka = searchParams.get("helka") ?? "";
  if (!gush || !helka) return NextResponse.json({ parcel: null });
  const parcel = await fetchParcelByGushHelka(gush, helka).catch(() => null);
  return NextResponse.json({ parcel });
}
