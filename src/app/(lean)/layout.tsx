import { getSession } from "@/server/auth";
import { LeanShell } from "@/components/lean/lean-shell";

// The lean quick-calculator shell: public like the rest of the app.
export default async function LeanLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return <LeanShell user={session}>{children}</LeanShell>;
}
