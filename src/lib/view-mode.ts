import "server-only";
import { cookies } from "next/headers";

// "home" is the minimalist landing (two path cards); "lean"/"full"/"custom" are
// the three interfaces reachable from the mode switcher. Only the latter three
// are ever written to the cookie by the switcher — "home" is the default landing.
export type ViewMode = "home" | "lean" | "full" | "custom";

export const VIEW_COOKIE = "omdan_view";

/** Where each mode's home screen lives. */
export const VIEW_HOME: Record<ViewMode, string> = {
  home: "/home",
  lean: "/quick",
  full: "/dashboard",
  custom: "/custom",
};

export function isViewMode(v: unknown): v is ViewMode {
  return v === "home" || v === "lean" || v === "full" || v === "custom";
}

/** The user's preferred interface — the minimalist /home landing by default. */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  const v = store.get(VIEW_COOKIE)?.value;
  return isViewMode(v) ? v : "home";
}
