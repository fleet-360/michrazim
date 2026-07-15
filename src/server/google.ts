import "server-only";
import { connectDB } from "./db";
import { User } from "./models";
import type { SessionUser } from "./auth";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return secret;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Build the Google consent-screen URL for the authorization-code flow. */
export function googleAuthUrl({ origin, state }: { origin: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/** Exchange an authorization code for tokens and fetch the user's profile. */
export async function exchangeCode({
  code,
  origin,
}: {
  code: string;
  origin: string;
}): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("Google token exchange returned no access_token");

  const infoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.sub || !info.email) throw new Error("Google userinfo missing sub/email");
  if (info.email_verified === false) throw new Error("Google account email is not verified");

  return {
    googleId: info.sub,
    email: info.email.toLowerCase().trim(),
    name: info.name || info.email.split("@")[0],
    picture: info.picture,
  };
}

/**
 * Find the user for a Google profile, linking by googleId first and then by
 * email (attaches Google to an existing password account), creating a fresh
 * account otherwise.
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<SessionUser> {
  await connectDB();

  let user = await User.findOne({ googleId: profile.googleId });
  if (!user) {
    user = await User.findOne({ email: profile.email });
    if (user) {
      // Existing password account with the same (verified) email — link it.
      user.set("googleId", profile.googleId);
      if (!user.get("avatarUrl") && profile.picture) user.set("avatarUrl", profile.picture);
      await user.save();
    }
  }
  if (!user) {
    user = await User.create({
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      avatarUrl: profile.picture,
      provider: "google",
      role: "analyst",
      onboarded: true,
    });
  }

  return {
    id: user._id.toString(),
    email: user.get("email"),
    name: user.get("name"),
    title: user.get("title") || undefined,
    role: user.get("role"),
  };
}
