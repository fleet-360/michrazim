"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { AiInsight, Project, Comparable, City, User } from "./models";
import { getProjectById, getCities } from "./queries";
import { verifyCredentials, createSession, destroySession, getSession } from "./auth";
import { analyzeProject, feeScheduleFor } from "./analysis";
import { VIEW_COOKIE, VIEW_HOME, isViewMode, type ViewMode } from "@/lib/view-mode";
import { riskAnalysis, answerQuestion, decisionReport, parseTenderText, parseTenderDocument, methodologyAssistant, parseDealsText, type ProjectMeta, type ParsedTender } from "@/lib/ai/insights";
import { derivePlotForUnits } from "@/lib/import-derive";
import {
  fetchPlansAtPoint,
  fetchPlansByNumber,
  fetchPlansByName,
  fetchPlanCenter,
  type PlanInfo,
} from "@/lib/data/iplan";
import { fetchParcelByGushHelka, govmapGeocode } from "@/lib/data/govmap";
import { EnrichmentJob } from "./models-enrich";
import type { ParcelIdentity as EnrichParcelIdentity, EnrichmentResult } from "@/lib/enrich/types";
import type { DealInputs, Track } from "@/lib/engine/types";
import {
  buildTenderIntelligence,
  type TenderLocationDTO as LocationDTO,
  type TenderMarketDTO as MarketDTO,
  type TenderReportDTO as ReportDTO,
} from "./tender-estimate";

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

/** Persist the preferred interface (lean/full/custom) and land on its home screen. */
export async function setViewModeAction(mode: ViewMode) {
  const safe: ViewMode = isViewMode(mode) ? mode : "lean";
  const store = await cookies();
  store.set(VIEW_COOKIE, safe, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(VIEW_HOME[safe]);
}

const TRIAL_COOKIE = "omdan_trial";

export interface QuickAnalyzeInput {
  track: "RMI" | "URBAN_RENEWAL";
  city: string;
  units: number;
  developCost?: number;
  existingUnits?: number;
}

export interface QuickAnalyzeResult {
  recommendedBid: number;
  expectedProfit: number;
  marginOnCost: number;
  probabilityOfLoss: number;
  verdict: "GO" | "CONDITIONAL" | "NO_GO";
  verdictReason: string;
  revenue: number;
  totalCost: number;
  plotAreaSqm: number;
  units: number;
}

/**
 * The lean quick-calculator: analyze a deal without saving anything.
 * Anonymous visitors get ONE free analysis (soft cookie limit), then must register.
 */
export async function quickAnalyzeAction(
  input: QuickAnalyzeInput,
): Promise<{ result: QuickAnalyzeResult } | { requireAuth: true } | { error: string }> {
  const session = await getSession();
  const store = await cookies();
  if (!session && store.get(TRIAL_COOKIE)) return { requireAuth: true };

  if (!input.city) return { error: "נא לבחור עיר" };
  const units = Math.max(8, Math.round(input.units || 0));
  if (!units) return { error: "נא להזין מספר יחידות דיור" };

  try {
    const cities = await getCities();
    const cityRow = cities.find((c) => c.name === input.city);
    const avgPrice = cityRow?.avgResidentialPricePerSqm ?? 26000;
    const far = input.track === "URBAN_RENEWAL" ? 4.5 : 3.0;
    const plotAreaSqm = derivePlotForUnits(units, far);
    const inputs = buildInputsFromTemplate({
      track: input.track,
      city: input.city,
      plotAreaSqm,
      far,
      avgPricePerSqm: avgPrice,
      existingUnits:
        input.track === "URBAN_RENEWAL" && input.existingUnits && input.existingUnits > 0
          ? input.existingUnits
          : undefined,
    });
    if (input.track === "RMI" && input.developCost && input.developCost > 0) {
      inputs.developmentCostsRMI = input.developCost;
    }

    const analysis = analyzeProject({ inputs, city: input.city }, cities, { runs: 4000 });

    // Burn the anonymous trial only after a successful run.
    if (!session) {
      store.set(TRIAL_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return {
      result: {
        recommendedBid: analysis.recommendation.recommendedBid,
        expectedProfit: analysis.bidEvaluation.profit,
        marginOnCost: analysis.bidEvaluation.marginOnCost,
        probabilityOfLoss: analysis.monteCarlo.probabilityOfLoss,
        verdict: analysis.verdict,
        verdictReason: analysis.verdictReason,
        revenue: analysis.bidEvaluation.totalCost + analysis.bidEvaluation.profit,
        totalCost: analysis.bidEvaluation.totalCost,
        plotAreaSqm,
        units,
      },
    };
  } catch (e) {
    console.error("quickAnalyzeAction failed:", e);
    return { error: "הניתוח נכשל — בדקו את החיבור למסד הנתונים ונסו שוב." };
  }
}

export type {
  TenderLocationDTO,
  TenderMarketDTO,
  TenderEstimateDTO,
  MinPriceComparisonDTO,
  TenderReportDTO,
} from "./tender-estimate";

/** Site strings that can actually be geocoded (not plot codes like "מגרש 12"). */
function looksLikePlace(s?: string): boolean {
  return !!s && s.trim().length >= 3 && !/מגרש|^[\d,\-./\s]+$/.test(s.trim());
}

/**
 * The upload-your-own-tender flow: parse (text/PDF) → locate → live תב"ע plans →
 * market context → secondary economic estimate. Data-first: every enrichment
 * panel is independent, so partial failures degrade to warnings, not errors.
 * Anonymous visitors get ONE free report (same cookie gate as quickAnalyzeAction).
 */
export async function analyzeTenderUploadAction(input: {
  text?: string;
  pdfBase64?: string;
}): Promise<{ report: ReportDTO } | { requireAuth: true } | { error: string }> {
  const session = await getSession();
  const store = await cookies();
  if (!session && store.get(TRIAL_COOKIE)) return { requireAuth: true };

  const text = (input.text ?? "").trim();
  const pdf = (input.pdfBase64 ?? "").trim();
  if (!pdf && text.length < 40) {
    return { error: "נא להדביק את טקסט המכרז (לפחות כמה שורות) או להעלות קובץ PDF" };
  }
  if (pdf && pdf.length > 12_000_000) return { error: "הקובץ גדול מדי — עד 8MB" };
  if (pdf && !/^[A-Za-z0-9+/=\s]+$/.test(pdf.slice(0, 200))) return { error: "קובץ לא תקין" };

  // 1. Parse — a failure here is a real error (nothing to report on), trial NOT burned.
  const tender = pdf ? await parseTenderDocument(pdf, text || undefined) : await parseTenderText(text);
  if (!tender) return { error: "לא הצלחתי לחלץ נתונים מהמכרז — נסו טקסט מפורט יותר" };
  // A document with zero identifying tender signals (junk text, a bare
  // contract) should say so honestly instead of rendering an empty report shell.
  const hasTenderSignal = Boolean(
    tender.city ||
      tender.gush ||
      tender.plotAreaSqm ||
      tender.units ||
      tender.minPrice ||
      tender.planNumber ||
      tender.tenderId ||
      tender.developmentCost,
  );
  if (!hasTenderSignal) {
    return {
      error:
        "המסמך לא נראה כמו חוברת מכרז — לא זוהו בו עיר, גוש/מגרש, יח״ד או מחירים. אם זהו חוזה או נספח, הדביקו גם את עמודי פרטי המכרז מהחוברת.",
    };
  }

  const warnings: string[] = [];

  // 2. Locate: exact parcel → address/site geocode → city centroid.
  let location: LocationDTO | null = null;
  try {
    if (tender.gush && tender.helka) {
      const parcel = await fetchParcelByGushHelka(tender.gush, tender.helka);
      if (parcel) {
        location = {
          lat: parcel.centroid[1],
          lng: parcel.centroid[0],
          areaSqm: Math.round(parcel.areaSqm),
          origin: "parcel",
          gush: tender.gush,
          helka: tender.helka,
        };
      }
    }
    if (!location && tender.city && looksLikePlace(tender.site)) {
      const hit = await govmapGeocode(`${tender.site}, ${tender.city}`);
      if (hit) {
        location = {
          lat: hit.lat,
          lng: hit.lng,
          origin: "geocode",
          gush: hit.gush ?? tender.gush,
          helka: hit.parcel ?? tender.helka,
          label: hit.label,
        };
      }
    }
    // A stated plan number anchors the tender inside the plan's blue line —
    // far better than a city centroid for the plans panel and the map pin.
    if (!location && tender.planNumber) {
      const center = await fetchPlanCenter(tender.planNumber);
      if (center) {
        location = {
          lat: center.lat,
          lng: center.lng,
          origin: "plan",
          gush: tender.gush,
          helka: tender.helka,
          label: `תחום תכנית ${tender.planNumber}`,
        };
      }
    }
    if (!location && tender.city) {
      const c = geocodeCity(tender.city);
      if (c) location = { lat: c.lat, lng: c.lng, origin: "city", gush: tender.gush, helka: tender.helka };
    }
  } catch (e) {
    console.error("tender locate failed:", e);
  }
  if (!location) warnings.push("לא הצלחתי לאתר את המגרש על המפה — נתוני התכנון עשויים להיות חלקיים");

  // 3. Live תב"ע plans from the Planning Administration (XPlan).
  let plans: PlanInfo[] = [];
  try {
    if (location) plans = await fetchPlansAtPoint(location.lat, location.lng);
    if (tender.planNumber) {
      const byNumber = await fetchPlansByNumber(tender.planNumber);
      const seen = new Set(byNumber.map((p) => p.planNumber));
      plans = [...byNumber, ...plans.filter((p) => !seen.has(p.planNumber))];
    }
    // Imprecise location (city centroid / plan bbox) + a named neighborhood:
    // a centroid point-query returns citywide plans of the WRONG area, so pull
    // the neighborhood's own plans by name (XPlan names carry "שכ' X, עיר").
    if ((location?.origin === "city" || location?.origin === "plan") && tender.site && tender.city) {
      const siteTerms = tender.site
        .replace(/\(.*?\)/g, " ")
        .replace(/שכונת|השכונה|שכ'|רובע|אתר|מתחם|קאנטרי/g, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !/^[\d,'"-]+$/.test(w))
        .slice(0, 2);
      // Try each meaningful site token until one matches — "קאנטרי רמות"
      // finds nothing for the first word but everything for "רמות".
      for (const siteTerm of siteTerms) {
        const byName = await fetchPlansByName([siteTerm, tender.city]);
        if (!byName.length) continue;
        const seen = new Set(plans.map((p) => p.planNumber));
        // Neighborhood plans first — they're the ones the tender lives in.
        plans = [...byName.filter((p) => !seen.has(p.planNumber)), ...plans].slice(0, 14);
        break;
      }
    }
  } catch (e) {
    console.error("xplan lookup failed:", e);
  }
  if (!plans.length && location) warnings.push("שירות התכנון (XPlan) לא החזיר תכניות לנקודה זו");

  // 4. Market context (city price anchor + municipal fee schedule).
  let market: MarketDTO | null = null;
  try {
    if (tender.city) {
      const cities = await getCities();
      const cityRow = cities.find((c) => c.name === tender.city);
      const schedule = feeScheduleFor(tender.city, cities);
      market = {
        city: tender.city,
        avgPricePerSqm: cityRow?.avgResidentialPricePerSqm ?? 26000,
        priceSource: cityRow?.avgResidentialPricePerSqm ? "city-db" : "default",
        fees: {
          buildingFeePerSqm: schedule.buildingFeePerSqm,
          sewageLevyPerSqm: schedule.sewageLevyPerSqm,
          waterLevyPerSqm: schedule.waterLevyPerSqm,
          roadsLevyPerSqm: schedule.roadsLevyPerSqm,
          drainageLevyPerSqm: schedule.drainageLevyPerSqm,
          openSpaceLevyPerSqm: schedule.openSpaceLevyPerSqm,
        },
        feesSource: cityRow ? "city-db" : "default",
      };
    }
  } catch (e) {
    console.error("tender market context failed:", e);
    warnings.push("נתוני השוק והאגרות אינם זמינים כרגע");
  }

  // 5. Multi-layer AI intelligence: plan curation → underwriting assumptions →
  //    typology-aware economic estimate → critic review + min-price comparison.
  let cities: Awaited<ReturnType<typeof getCities>> = [];
  try {
    cities = await getCities();
  } catch (e) {
    console.error("cities load failed:", e);
    warnings.push("נתוני הערים אינם זמינים — האומדן משתמש בברירות מחדל ארציות");
  }
  const intelligence = await buildTenderIntelligence({
    tender,
    plans,
    location,
    market,
    cities,
    runs: 4000,
  });
  warnings.push(...intelligence.warnings);

  // Burn the anonymous trial only after a report was actually produced.
  if (!session) {
    store.set(TRIAL_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return {
    report: {
      tender,
      plans,
      planCuration: intelligence.planCuration,
      location,
      market,
      assumptions: intelligence.assumptions,
      estimate: intelligence.estimate,
      review: intelligence.review,
      minPriceComparison: intelligence.minPriceComparison,
      analyst: intelligence.analyst,
      warnings,
    },
  };
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

export async function parseTenderAction(input: { text?: string; pdfBase64?: string }) {
  const text = (input.text ?? "").trim();
  const pdf = (input.pdfBase64 ?? "").trim();
  if (!pdf && !text) return { error: "נא להדביק טקסט או להעלות קובץ PDF" };
  const parsed = pdf ? await parseTenderDocument(pdf, text || undefined) : await parseTenderText(text);
  if (!parsed) return { error: "לא הצלחתי לחלץ נתונים מהמכרז" };
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

/* ------------------------------------------------------------------ */
/* Smart enrichment (full / partial modes) — background job + polling   */
/* The web-navigation agent runs for minutes, longer than a serverless   */
/* request, so we create a job, process it in a route handler            */
/* (maxDuration=300), and the client polls for progress + result.        */
/* ------------------------------------------------------------------ */

export async function offerDealEnrichmentAction(input: {
  identity: EnrichParcelIdentity;
  refId?: string;
  mode?: "full" | "partial";
}): Promise<{ jobId: string } | { requireAuth: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { requireAuth: true as const };
  await connectDB();
  const weakFields = [
    { key: "comparable_deals", label: "עסקאות השוואה באזור", domain: "prices" },
  ];
  const job = await EnrichmentJob.create({
    userId: session.id,
    mode: input.mode ?? "full",
    refId: input.refId,
    identity: input.identity,
    weakFields,
    status: "queued",
    progress: [],
  });
  return { jobId: String(job._id) };
}

export async function pollDealEnrichmentAction(
  jobId: string,
): Promise<
  | { status: string; progress: string[]; result?: EnrichmentResult; error?: string }
  | { requireAuth: true }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { requireAuth: true as const };
  if (!mongoose.isValidObjectId(jobId)) return { error: "עבודה לא נמצאה" };
  await connectDB();
  const job = await EnrichmentJob.findById(jobId).lean<any>();
  if (!job || String(job.userId) !== session.id) return { error: "עבודה לא נמצאה" };
  const result =
    job.status === "done"
      ? { plan: job.plan, facts: job.facts ?? [], warnings: job.warnings ?? [], stats: job.stats }
      : undefined;
  return { status: job.status, progress: job.progress ?? [], result, error: job.error };
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
import { geocodeTenderPoint } from "@/lib/data/govmap";

export interface ImportTenderInput {
  name: string;
  city: string;
  units: number;
  totalDevelopCost?: number;
  site?: string;
  semelYeshuv?: string;
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
  site?: string;
  semelYeshuv?: string;
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
  // precise (neighborhood/address) coordinate via GovMap, falling back to the city centroid
  const geo = await geocodeTenderPoint({
    city: opts.city,
    site: opts.site,
    name: opts.name,
    semelYeshuv: opts.semelYeshuv,
  });
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
      site: t.site,
      semelYeshuv: t.semelYeshuv,
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
  semelYeshuv?: string;
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
      semelYeshuv: t.semelYeshuv,
    });
  } catch (e) {
    console.error("importRenewalAction failed:", e);
    return { error: "שמירת המתחם נכשלה — בדקו את החיבור למסד הנתונים ונסו שוב." };
  }
  revalidatePath("/dashboard");
  redirect(`/projects/${id}`);
}
