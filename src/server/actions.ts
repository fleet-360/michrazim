"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectDB } from "./db";
import { AiInsight, Project, Comparable, City } from "./models";
import { getProjectById, getCities } from "./queries";
import { verifyCredentials, createSession, destroySession, getSession } from "./auth";
import { analyzeProject } from "./analysis";
import { riskAnalysis, answerQuestion, decisionReport, parseTenderText, methodologyAssistant, parseDealsText, type ProjectMeta } from "@/lib/ai/insights";
import type { DealInputs, Track } from "@/lib/engine/types";

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const user = await verifyCredentials(email, password);
  if (!user) return { error: "אימייל או סיסמה שגויים" };
  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
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

/** Create a fully-analyzable project from a live RMI tender (real dev costs). */
export async function importTenderAction(t: ImportTenderInput) {
  const session = await getSession();
  await connectDB();
  const cities = await getCities();
  const cityRow = cities.find((c) => c.name === t.city);
  const avgPrice = cityRow?.avgResidentialPricePerSqm ?? 26000;

  const units = Math.max(8, t.units || 60);
  // Reverse-engineer a plot area that makes the rights engine reproduce the tender's
  // stated unit count exactly, so the project card matches the source tender (no 255→242
  // surprise). Mirrors buildInputsFromTemplate (RMI): far 3.0, eff 0.82, avg unit 92 m²,
  // commercial 12% of plot ⇒ engine units = floor((plot·far·eff − round(plot·0.12)) / 92).
  const FAR = 3.0;
  const unitsFor = (plot: number) => Math.floor((plot * FAR * 0.82 - Math.round(plot * 0.12)) / 92);
  let plotAreaSqm = Math.round((units * 92) / (FAR * 0.82 - 0.12)); // invert the net factor (2.34)
  // integer-rounding correction so the derived unit count lands exactly on the tender's
  for (let i = 0; i < 80 && unitsFor(plotAreaSqm) !== units; i++) {
    plotAreaSqm += unitsFor(plotAreaSqm) < units ? 1 : -1;
  }

  const inputs = buildInputsFromTemplate({ track: "RMI", city: t.city, plotAreaSqm, far: FAR, avgPricePerSqm: avgPrice });
  // totalDevelopCost is the RMI project-total development pay (TenderDevPay).
  if (t.totalDevelopCost && t.totalDevelopCost > 0) inputs.developmentCostsRMI = t.totalDevelopCost;

  const geo = geocodeCity(t.city);
  const created = await Project.create({
    name: t.name,
    track: "RMI",
    status: "ANALYZING",
    city: t.city,
    address: t.city,
    lat: geo?.lat,
    lng: geo?.lng,
    plotAreaSqm,
    riskAppetite: 0.4,
    inputs,
    createdBy: session ? session.id : undefined,
  });
  revalidatePath("/dashboard");
  redirect(`/projects/${created._id.toString()}`);
}
