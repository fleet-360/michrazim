import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe for Docker/Caddy — intentionally DB-independent. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
