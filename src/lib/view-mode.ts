import "server-only";
import { cookies } from "next/headers";

export type ViewMode = "lean" | "full" | "custom";

export const VIEW_COOKIE = "omdan_view";

/** Where each mode's home screen lives. */
export const VIEW_HOME: Record<ViewMode, string> = {
  lean: "/quick",
  full: "/dashboard",
  custom: "/custom",
};

export function isViewMode(v: unknown): v is ViewMode {
  return v === "lean" || v === "full" || v === "custom";
}

/** The user's preferred interface — lean quick-calculator by default. */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  const v = store.get(VIEW_COOKIE)?.value;
  return isViewMode(v) ? v : "lean";
}
