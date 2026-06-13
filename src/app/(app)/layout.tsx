import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getProjects } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const projects = await getProjects();
  const lite = projects.map((p) => ({ _id: p._id, name: p.name, city: p.city, track: p.track }));
  return (
    <AppShell user={session} projects={lite}>
      {children}
    </AppShell>
  );
}
