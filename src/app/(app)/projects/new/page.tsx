import { getCities } from "@/server/queries";
import { NewProjectWizard } from "@/components/wizard/new-project-wizard";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const cities = await getCities();
  return <NewProjectWizard cities={cities} />;
}
