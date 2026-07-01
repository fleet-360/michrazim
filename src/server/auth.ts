import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { User } from "./models";

const COOKIE = "omdan_session";

/**
 * In production the app refuses to run on the well-known dev secret — a
 * predictable signing key would let anyone forge a session for any user.
 * Resolved lazily (not at module load) so `next build` never needs the env.
 */
function getSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required in production — set a 32+ char random secret");
    }
    return new TextEncoder().encode("dev_fallback_secret_change_me_please_0123456789");
  }
  return new TextEncoder().encode(configured);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  title?: string;
  role: string;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase().trim() }).lean<{
    _id: { toString(): string };
    email: string;
    name: string;
    title?: string;
    role: string;
    passwordHash: string;
  }>();
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user._id.toString(), email: user.email, name: user.name, title: user.title, role: user.role };
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      title: payload.title ? String(payload.title) : undefined,
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
