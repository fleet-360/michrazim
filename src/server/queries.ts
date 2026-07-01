import "server-only";
import { connectDB } from "./db";
import { City, Comparable, Project, TenderListing, User } from "./models";
import { getSession } from "./auth";
import type { DealInputs, Track } from "@/lib/engine/types";

/** Tender ids (dc-/pl-/ur-) the signed-in user follows. Empty for anonymous. */
export async function getWatchlist(): Promise<string[]> {
  const session = await getSession();
  if (!session) return [];
  await connectDB();
  const user = await User.findById(session.id).select("watchlist").lean<{ watchlist?: string[] }>();
  return user?.watchlist ?? [];
}

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
  shareToken?: string;
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

/** Projects belonging to the signed-in user. Anonymous users get an empty list. */
export async function getProjects(): Promise<ProjectRow[]> {
  const session = await getSession();
  if (!session) return [];
  await connectDB();
  const docs = await Project.find({ createdBy: session.id }).sort({ updatedAt: -1 }).lean();
  return plain<ProjectRow[]>(docs);
}

/** A single project, only if it belongs to the signed-in user (owner-scoped). */
export async function getProjectById(id: string): Promise<ProjectRow | null> {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  await connectDB();
  const doc = await Project.findById(id).lean<{ createdBy?: { toString(): string } }>();
  if (!doc) return null;
  const session = await getSession();
  // owner-scoped: a project with an owner is visible only to that owner
  if (doc.createdBy && (!session || String(doc.createdBy) !== session.id)) return null;
  return plain<ProjectRow>(doc);
}

/**
 * Deal-room access: a project fetched by its unguessable share token, with no
 * session requirement — this is what investor/bank read-only links resolve.
 */
export async function getProjectByShareToken(token: string): Promise<ProjectRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  await connectDB();
  const doc = await Project.findOne({ shareToken: token }).lean();
  if (!doc) return null;
  return plain<ProjectRow>(doc);
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
