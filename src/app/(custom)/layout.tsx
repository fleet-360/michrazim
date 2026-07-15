import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { CustomShell } from "@/components/custom/custom-shell";

// Custom mode persists user files and mappings — login required.
export default async function CustomLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fcustom");
  return <CustomShell user={session}>{children}</CustomShell>;
}
