import "server-only";
import { connectDB } from "./db";
import { City, Comparable, Project, TenderListing } from "./models";
import type { DealInputs, Track } from "@/lib/engine/types";

/** JSON-safe plain object (ObjectId → hex string, Date → ISO). */
function plain<T>(doc: unknown): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

export interface CityRow {
  _id: string;
  name: string;
  region?: string;
  lat?: number;
  lng?: number;
  buildingFeePerSqm?: number;
  sewageLevyPerSqm?: number;
  waterLevyPerSqm?: number;
  roadsLevyPerSqm?: number;
  drainageLevyPerSqm?: number;
  openSpaceLevyPerSqm?: number;
  avgResidentialPricePerSqm?: number;
  notes?: string;
}

export interface ProjectRow {
  _id: string;
  name: string;
  track: Track;
  status: string;
  city: string;
  gush?: string;
  helka?: string;
  address?: string;
  lat?: number;
  lng?: number;
  plotAreaSqm: number;
  marketAnchor?: number;
  bid?: number;
  riskAppetite?: number;
  inputs: DealInputs;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComparableRow {
  _id: string;
  city: string;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  dealDate?: string;
  pricePerSqm?: number;
  totalPrice?: number;
  sizeSqm?: number;
  rooms?: number;
  floor?: number;
  yearBuilt?: number;
  propertyType?: string;
  source?: string;
}

export interface TenderRow {
  _id: string;
  tenderId?: string;
  title?: string;
  city?: string;
  gush?: string;
  helka?: string;
  lat?: number;
  lng?: number;
  plotAreaSqm?: number;
  units?: number;
  far?: number;
  developmentCost?: number;
  minPrice?: number;
  publishDate?: string;
  submissionDeadline?: string;
  status?: string;
  url?: string;
  source?: string;
}

export async function getCities(): Promise<CityRow[]> {
  await connectDB();
  const docs = await City.find().sort({ avgResidentialPricePerSqm: -1 }).lean();
  return plain<CityRow[]>(docs);
}

export async function getProjects(): Promise<ProjectRow[]> {
  await connectDB();
  const docs = await Project.find().sort({ updatedAt: -1 }).lean();
  return plain<ProjectRow[]>(docs);
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  await connectDB();
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  const doc = await Project.findById(id).lean();
  return doc ? plain<ProjectRow>(doc) : null;
}

export async function getComparables(city?: string): Promise<ComparableRow[]> {
  await connectDB();
  const q = city ? { city } : {};
  const docs = await Comparable.find(q).sort({ dealDate: -1 }).lean();
  return plain<ComparableRow[]>(docs);
}

export async function getTenders(): Promise<TenderRow[]> {
  await connectDB();
  const docs = await TenderListing.find().sort({ submissionDeadline: 1 }).lean();
  return plain<TenderRow[]>(docs);
}
