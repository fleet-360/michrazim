"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { AiInsight, Project, Comparable, City, User } from "./models";
import { getProjectById, getCities } from "./queries";
import { verifyCredentials, createSession, destroySession, getSession } from "./auth";
import { analyzeProject } from "./analysis";
import { riskAnalysis, answerQuestion, decisionReport, parseTenderText, methodologyAssistant, parseDealsText, type ProjectMeta } from "@/lib/ai/insights";
import { derivePlotForUnits } from "@/lib/import-derive";
import type { DealInputs, Track } from "@/lib/engine/types";

/** Only allow same-origin relative redirects (guard against open-redirect). */
function safeNext(next: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "");
  const user = await verifyCredentials(email, password);
  if (!user) return { error: "אימייל או סיסמה שגויים" };
  await createSession(user);
  redirect(safeNext(next));
}

/** Self-service registration (email + password) with onboarding profile fields. */
export async function registerAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const next = String(formData.get("next") || "");
  if (!email || !password || !name) return { error: "נא למלא אימייל, שם וסיסמה" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "כתובת אימייל לא תקינה" };
  if (password.length < 6) return { error: "הסיסמה חייבת להכיל לפחות 6 תווים" };
  try {
    await connectDB();
    const existing = await User.findOne({ email }).lean();
    if (existing) return { error: "כתובת האימייל כבר רשומה — נסו להתחבר" };
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await User.create({ email, name, passwordHash, role: "analyst", company, title, onboarded: true });
    await createSession({ id: created._id.toString(), email, name, title: title || undefined, role: "analyst" });
  } catch (e) {
    console.error("registerAction failed:", e);
    return { error: "ההרשמה נכשלה — נסו שוב." };
  }
  redirect(safeNext(next));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Add/remove a tender from the signed-in user's watchlist (favorites). */
export async function toggleWatchAction(
  tenderId: string,
): Promise<{ watching: boolean } | { requireAuth: true }> {
  const session = await getSession();
  if (!session) return { requireAuth: true };
  await connectDB();
  const user = await User.findById(session.id).select("watchlist");
  if (!user) return { requireAuth: true };
  const list: string[] = Array.isArray(user.watchlist) ? user.watchlist : [];
  const idx = list.indexOf(tenderId);
  let watching: boolean;
  if (idx >= 0) {
    list.splice(idx, 1);
    watching = false;
  } else {
    list.push(tenderId);
    watching = true;
  }
  user.set("watchlist", list);
  await user.save();
  revalidatePath("/dashboard");
  return { watching };
}

async function loadMetaAndAnalysis(id: string, opts?: { bid?: number; riskAppetite?: number }) {
  const project = await getProjectById(id);
  if (!project) return null;
  const cities = await getCities();
  const analysis = analyzeProject(
    {
      inputs: project.inputs,
      city: project.city,
      bid: opts?.bid ?? project.bid,
      marketAnchor: project.marketAnchor,
      riskAppetite: opts?.riskAppetite ?? project.riskAppetite,
    },
    cities,
    { runs: 4000 },
  );
  const meta: ProjectMeta = {
    name: project.name,
    track: project.track,
    city: project.city,
    address: project.address,
    plotAreaSqm: project.plotAreaSqm,
    marketAnchor: project.marketAnchor,
  };
  return { project, meta, analysis };
}

export async function updateProjectBid(id: string, bid: number, riskAppetite: number) {
  await connectDB();
  await Project.findByIdAndUpdate(id, { bid, riskAppetite });
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

export async function generateRiskInsight(id: string) {
  const loaded = await loadMetaAndAnalysis(id);
  if (!loaded) return { error: "פרויקט לא נמצא" };
  const content = await riskAnalysis(loaded.meta, loaded.analysis);
  if (!content) return { error: "שירות ה-AI אינו זמין כרגע" };
  await connectDB();
  await AiInsight.create({ projectId: id, kind: "risk", content, model: "smart" });
  return { content };
}

export async function generateReportInsight(id: string) {
  const loaded = await loadMetaAndAnalysis(id);
  if (!loaded) return { error: "פרויקט לא נמצא" };
  const content = await decisionReport(loaded.meta, loaded.analysis);
  if (!content) return { error: "שירות ה-AI אינו זמין כרגע" };
  await connectDB();
  await AiInsight.create({ projectId: id, kind: "report", content, model: "smart" });
  return { content };
}

export async function askProjectQuestion(id: string, question: string) {
  const loaded = await loadMetaAndAnalysis(id);
  if (!loaded) return { error: "פרויקט לא נמצא" };
  const content = await answerQuestion(loaded.meta, loaded.analysis, question);
  if (!content) return { error: "שירות ה-AI אינו זמין כרגע" };
  return { content };
}

export async function parseTenderAction(text: string) {
  const parsed = await parseTenderText(text);
  if (!parsed) return { error: "לא הצלחתי לחלץ נתונים מהטקסט" };
  return { parsed };
}

export async function importDealsAction(text: string, city: string) {
  if (!(await getSession())) return { requireAuth: true as const };
  if (!text.trim() || !city) return { error: "נא לבחור עיר ולהדביק נתונים" };
  const deals = await parseDealsText(text, city);
  if (!deals || deals.length === 0) return { error: "לא הצלחתי לזהות עסקאות בטקסט" };
  await connectDB();
  const geo = geocodeCity(city);
  const docs = deals
    .filter((d) => d.pricePerSqm || (d.totalPrice && d.sizeSqm))
    .map((d, i) => {
      const pricePerSqm = d.pricePerSqm || (d.totalPrice && d.sizeSqm ? Math.round(d.totalPrice / d.sizeSqm) : undefined);
      const jitter = ((i * 53) % 40 - 20) / 5000;
      return {
        city,
        neighborhood: d.neighborhood,
        address: d.address,
        gush: d.gush,
        helka: d.helka,
        lat: geo ? geo.lat + jitter : undefined,
        lng: geo ? geo.lng + jitter : undefined,
        dealDate: d.dealDate,
        pricePerSqm,
        totalPrice: d.totalPrice,
        sizeSqm: d.sizeSqm,
        rooms: d.rooms,
        floor: d.floor,
        yearBuilt: d.yearBuilt,
        propertyType: "דירה",
        source: "live",
      };
    });
  if (docs.length === 0) return { error: "זוהו עסקאות אך חסר בהן מחיר/שטח" };
  await Comparable.insertMany(docs);

  // Update the city's real price anchor = median ₪/m² of its actual comparables.
  const all = await Comparable.find({ city }).select("pricePerSqm").lean<{ pricePerSqm?: number }[]>();
  const prices = all.map((c) => c.pricePerSqm || 0).filter(Boolean).sort((a, b) => a - b);
  if (prices.length) {
    const median = prices[Math.floor(prices.length / 2)];
    await City.findOneAndUpdate({ name: city }, { avgResidentialPricePerSqm: median });
  }

  revalidatePath("/comparables");
  return { count: docs.length };
}

export async function deleteComparableAction(id: string) {
  await connectDB();
  await Comparable.findByIdAndDelete(id);
  revalidatePath("/comparables");
  return { ok: true };
}

export async function clearCityComparablesAction(city: string) {
  await connectDB();
  const res = await Comparable.deleteMany({ city });
  revalidatePath("/comparables");
  return { ok: true, deleted: res.deletedCount ?? 0 };
}

export interface CityFeesPatch {
  buildingFeePerSqm?: number;
  sewageLevyPerSqm?: number;
  waterLevyPerSqm?: number;
  roadsLevyPerSqm?: number;
  drainageLevyPerSqm?: number;
  openSpaceLevyPerSqm?: number;
  avgResidentialPricePerSqm?: number;
}

export async function updateCityFeesAction(cityId: string, fees: CityFeesPatch) {
  await connectDB();
  await City.findByIdAndUpdate(cityId, fees);
  revalidatePath("/data/cities");
  return { ok: true };
}

export async function askAssistantAction(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
) {
  const content = await methodologyAssistant(question, history);
  if (!content) return { error: "שירות ה-AI אינו זמין כרגע" };
  return { content };
}

export interface NewProjectInput {
  name: string;
  track: Track;
  city: string;
  gush?: string;
  helka?: string;
  address?: string;
  lat?: number;
  lng?: number;
  marketAnchor?: number;
  inputs: DealInputs;
}

export async function createProjectAction(data: NewProjectInput) {
  const session = await getSession();
  if (!session) return { requireAuth: true as const };
  await connectDB();
  const created = await Project.create({
    name: data.name,
    track: data.track,
    status: "ANALYZING",
    city: data.city,
    gush: data.gush,
    helka: data.helka,
    address: data.address,
    lat: data.lat,
    lng: data.lng,
    plotAreaSqm: data.inputs.rights.plotAreaSqm,
    marketAnchor: data.marketAnchor,
    riskAppetite: 0.4,
    inputs: data.inputs,
    createdBy: session ? session.id : undefined,
  });
  revalidatePath("/dashboard");
  redirect(`/projects/${created._id.toString()}`);
}

export async function deleteProjectAction(id: string) {
  await connectDB();
  await Project.findByIdAndDelete(id);
  revalidatePath("/dashboard");
  return { ok: true };
}

import { buildInputsFromTemplate } from "@/lib/templates";
import { geocodeCity } from "@/lib/data/localities";

export interface ImportTenderInput {
  name: string;
  city: string;
  units: number;
  totalDevelopCost?: number;
}

export type ImportResult = { error?: string; requireAuth?: boolean } | void;

interface CreateImportedOpts {
  name: string;
  city: string;
  track: "RMI" | "URBAN_RENEWAL";
  units: number;
  far: number;
  developCost?: number;
  existingUnits?: number;
}

/** Shared project-creation for both import flows. Throws on DB failure. */
async function createImportedProject(opts: CreateImportedOpts): Promise<string> {
  await connectDB();
  const session = await getSession();
  const cities = await getCities();
  const cityRow = cities.find((c) => c.name === opts.city);
  const avgPrice = cityRow?.avgResidentialPricePerSqm ?? 26000;
  const units = Math.max(8, opts.units || 60);
  const plotAreaSqm = derivePlotForUnits(units, opts.far);
  const inputs = buildInputsFromTemplate({
    track: opts.track,
    city: opts.city,
    plotAreaSqm,
    far: opts.far,
    avgPricePerSqm: avgPrice,
    existingUnits: opts.existingUnits && opts.existingUnits > 0 ? opts.existingUnits : undefined,
  });
  if (opts.developCost && opts.developCost > 0) inputs.developmentCostsRMI = opts.developCost;
  const geo = geocodeCity(opts.city);
  const created = await Project.create({
    name: opts.name,
    track: opts.track,
    status: "ANALYZING",
    city: opts.city,
    address: opts.city,
    lat: geo?.lat,
    lng: geo?.lng,
    plotAreaSqm,
    riskAppetite: 0.4,
    inputs,
    createdBy: session ? session.id : undefined,
  });
  return created._id.toString();
}

/**
 * Create a fully-analyzable project from a live RMI tender (real dev costs).
 * redirect() is OUTSIDE the try so its control-flow signal is never mistaken for
 * a failure; only a genuine DB error returns { error } (shown to the user).
 */
export async function importTenderAction(t: ImportTenderInput): Promise<ImportResult> {
  if (!(await getSession())) return { requireAuth: true };
  let id = "";
  try {
    id = await createImportedProject({
      name: t.name,
      city: t.city,
      track: "RMI",
      units: t.units,
      far: 3.0,
      developCost: t.totalDevelopCost,
    });
  } catch (e) {
    console.error("importTenderAction failed:", e);
    return { error: "שמירת המכרז נכשלה — בדקו את החיבור למסד הנתונים ונסו שוב." };
  }
  revalidatePath("/dashboard");
  redirect(`/projects/${id}`);
}

export interface ImportRenewalInput {
  name: string;
  city: string;
  targetUnits: number;
  existingUnits?: number;
  planNumber?: string;
}

/** Create an URBAN_RENEWAL project from a live urban-renewal compound (פינוי-בינוי/תמ"א). */
export async function importRenewalAction(t: ImportRenewalInput): Promise<ImportResult> {
  if (!(await getSession())) return { requireAuth: true };
  let id = "";
  try {
    id = await createImportedProject({
      name: t.name,
      city: t.city,
      track: "URBAN_RENEWAL",
      units: t.targetUnits,
      far: 4.5,
      existingUnits: t.existingUnits,
    });
  } catch (e) {
    console.error("importRenewalAction failed:", e);
    return { error: "שמירת המתחם נכשלה — בדקו את החיבור למסד הנתונים ונסו שוב." };
  }
  revalidatePath("/dashboard");
  redirect(`/projects/${id}`);
}
