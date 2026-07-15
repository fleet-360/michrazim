import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/server/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";
const NEXT_COOKIE = "g_oauth_next";

/** Kick off the Google OAuth flow: stash state+next in cookies, redirect to consent. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "";
  const state = crypto.randomUUID();

  let authUrl: string;
  try {
    authUrl = googleAuthUrl({ origin: url.origin, state });
  } catch (e) {
    console.error("google auth init failed:", e);
    return NextResponse.redirect(new URL("/login?error=google", url.origin));
  }

  const res = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // the round-trip to Google should take minutes, not hours
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(NEXT_COOKIE, next, cookieOpts);
  return res;
}
