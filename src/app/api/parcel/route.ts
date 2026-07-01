import { NextResponse } from "next/server";
import { fetchParcelByGushHelka } from "@/lib/data/govmap";
import { gushHelkaSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/** Client-side parcel lookup so the map renders instantly then upgrades. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gush = gushHelkaSchema.safeParse(searchParams.get("gush") ?? "");
  const helka = gushHelkaSchema.safeParse(searchParams.get("helka") ?? "");
  if (!gush.success || !helka.success) return NextResponse.json({ parcel: null });
  const parcel = await fetchParcelByGushHelka(gush.data, helka.data).catch(() => null);
  return NextResponse.json({ parcel });
}
