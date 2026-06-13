import { notFound } from "next/navigation";
import { getProjectById, getCities, getComparables } from "@/server/queries";
import { feeScheduleFor } from "@/server/analysis";
import { ProjectWorkspace } from "@/components/project/project-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const lat = project.lat ?? 32.0853;
  const lng = project.lng ?? 34.7818;
  const [cities, comparables] = await Promise.all([getCities(), getComparables(project.city)]);
  const schedule = feeScheduleFor(project.city, cities);

  return (
    <ProjectWorkspace
      id={project._id}
      name={project.name}
      track={project.track}
      city={project.city}
      address={project.address}
      lat={lat}
      lng={lng}
      gush={project.gush}
      helka={project.helka}
      plotAreaSqm={project.plotAreaSqm}
      marketAnchor={project.marketAnchor}
      inputs={project.inputs}
      schedule={schedule}
      initialBid={project.bid}
      initialRisk={project.riskAppetite ?? 0.4}
      comparables={comparables.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        pricePerSqm: c.pricePerSqm,
        address: c.address,
        sizeSqm: c.sizeSqm,
        rooms: c.rooms,
        dealDate: c.dealDate,
        neighborhood: c.neighborhood,
      }))}
    />
  );
}
