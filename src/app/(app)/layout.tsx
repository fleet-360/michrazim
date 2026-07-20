import { getSession } from "@/server/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getProjects } from "@/server/queries";
import { getViewMode } from "@/lib/view-mode";

// Public hybrid model: anyone may browse and analyze. Saving data requires login,
// which individual server actions enforce. No global redirect here.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, projects, viewMode] = await Promise.all([
    getSession(),
    getProjects(), // [] for anonymous (owner-scoped)
    getViewMode(),
  ]);
  const lite = projects.map((p) => ({ _id: p._id, name: p.name, city: p.city, track: p.track }));
  return (
    <AppShell user={session} projects={lite} viewMode={viewMode}>
      {children}
    </AppShell>
  );
}
