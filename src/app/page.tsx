import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { getViewMode, VIEW_HOME } from "@/lib/view-mode";
import { getCities } from "@/server/queries";
import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  // Signed-in users skip the landing and go straight to their preferred interface.
  if (session) {
    const mode = await getViewMode();
    redirect(VIEW_HOME[mode]);
  }

  const cities = await getCities().catch(() => []);
  return <LandingPage cities={cities.map((c) => ({ name: c.name }))} />;
}
