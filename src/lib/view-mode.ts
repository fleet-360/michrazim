import "server-only";
import { cookies } from "next/headers";

export type ViewMode = "lean" | "full";

export const VIEW_COOKIE = "omdan_view";

/** The user's preferred interface — lean quick-calculator by default. */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return store.get(VIEW_COOKIE)?.value === "full" ? "full" : "lean";
}
