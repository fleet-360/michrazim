import { NextResponse } from "next/server";
import { exchangeCode, findOrCreateGoogleUser, publicOrigin } from "@/server/google";
import { createSession } from "@/server/auth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";
const NEXT_COOKIE = "g_oauth_next";

/** Only allow same-origin relative redirects (guard against open-redirect). */
function safeNext(next: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

function readCookie(req: Request, name: string): string {
  const header = req.headers.get("cookie") ?? "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

/** Complete the Google OAuth flow: verify state, exchange code, sign the user in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Must match the redirect_uri sent during the auth step AND be the public
  // https origin — Google validates it on the token exchange (see publicOrigin).
  const origin = publicOrigin(req);
  const fail = () => {
    const res = NextResponse.redirect(new URL("/login?error=google", origin));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(NEXT_COOKIE);
    return res;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(req, STATE_COOKIE);
  // CSRF guard: the state must round-trip through Google unchanged.
  if (!code || !state || !expectedState || state !== expectedState) return fail();

  try {
    const profile = await exchangeCode({ code, origin });
    const user = await findOrCreateGoogleUser(profile);
    await createSession(user);
  } catch (e) {
    console.error("google callback failed:", e);
    return fail();
  }

  const res = NextResponse.redirect(new URL(safeNext(readCookie(req, NEXT_COOKIE)), origin));
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}
