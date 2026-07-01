import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { AI_ENABLED } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

/**
 * Readiness probe for load balancers / uptime monitors. Reports the two
 * dependencies that matter: the database (hard requirement → 503) and the AI
 * key (soft — features degrade gracefully without it).
 */
export async function GET() {
  let db = false;
  try {
    // connectDB caps server selection at 5s, so this can't hang the probe.
    const conn = await connectDB();
    db = conn.connection.readyState === 1;
  } catch {
    db = false;
  }
  const body = {
    ok: db,
    db,
    ai: AI_ENABLED(),
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: db ? 200 : 503 });
}
