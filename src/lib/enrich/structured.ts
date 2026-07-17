import "server-only";
import { fetchPlansAtPoint, fetchPlansByNumber, type PlanInfo } from "@/lib/data/iplan";
import { fetchParcelByGushHelka } from "@/lib/data/govmap";
import { getLiveTenders } from "@/lib/data/rmi";
import type { ParcelIdentity, FactCard, FetchTask } from "./types";

/**
 * Non-agent (deterministic) fetchers. These hit live sources that DO respond to
 * our server IP — iplan (XPlan תב"ע), govmap (parcel geometry), and the
 * data.gov.il RMI datasets. Each returns FactCard[] with a real sourceUrl.
 */
export async function fetchStructured(input: {
  identity: ParcelIdentity;
  task: FetchTask;
}): Promise<{ facts: FactCard[]; warnings: string[] }> {
  const { identity, task } = input;
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const facts: FactCard[] = [];

  try {
    if (task.source === "iplan") {
      let plans: PlanInfo[] = [];
      if (identity.lat && identity.lng) {
        plans = await fetchPlansAtPoint(identity.lat, identity.lng).catch(() => []);
      }
      if (identity.planNumber) {
        const byNum = await fetchPlansByNumber(identity.planNumber).catch(() => []);
        const seen = new Set(byNum.map((p) => p.planNumber));
        plans = [...byNum, ...plans.filter((p) => !seen.has(p.planNumber))];
      }
      for (const p of plans.slice(0, 8)) {
        facts.push({
          taskId: task.id,
          kind: "plan",
          source: "iplan",
          sourceUrl: p.mavatUrl,
          quote: [p.planNumber, p.name, p.status, p.landUse].filter(Boolean).join(" · ").slice(0, 400),
          fetchedAt,
          confidence: "high",
          plan: p,
          label: `תב"ע ${p.planNumber}${p.name ? ` — ${p.name}` : ""}`,
        });
      }
      if (facts.length === 0) warnings.push("לא נמצאו תב\"ע חיות לנקודה/מספר התוכנית");
    } else if (task.source === "govmap") {
      if (identity.gush && identity.helka) {
        const parcel = await fetchParcelByGushHelka(identity.gush, identity.helka).catch(() => null);
        if (parcel && parcel.origin === "live") {
          facts.push({
            taskId: task.id,
            kind: "parcel",
            source: "govmap",
            sourceUrl: `https://www.govmap.gov.il/?q=${identity.gush}/${identity.helka}`,
            quote: `גוש ${identity.gush} חלקה ${identity.helka} — שטח ${Math.round(parcel.areaSqm)} מ"ר (מדידה חיה)`,
            fetchedAt,
            confidence: "high",
            label: `שטח חלקה: ${Math.round(parcel.areaSqm)} מ"ר`,
            fields: [{ key: "plot_area_sqm", value: Math.round(parcel.areaSqm) }],
          });
        } else {
          warnings.push("שטח חלקה מדויק לא זמין ב-govmap (רק סינתטי) — לא נכלל");
        }
      }
    } else if (task.source === "rmi") {
      const q = identity.city ?? identity.neighborhood ?? "";
      const tenders = await getLiveTenders({ q, limit: 200 }).catch(() => []);
      const matched = tenders
        .filter((t) => !identity.city || t.city?.includes(identity.city) || identity.city.includes(t.city ?? ""))
        .slice(0, 6);
      for (const t of matched) {
        facts.push({
          taskId: task.id,
          kind: "rmi",
          source: "rmi",
          sourceUrl: t.landGovUrl || t.mavatUrl || t.url,
          quote: [t.name, t.city, t.status, t.planNumber && `תב"ע ${t.planNumber}`, t.totalDevelopCost && `פיתוח ${t.totalDevelopCost}₪`]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 400),
          fetchedAt,
          confidence: "medium",
          label: `רמ"י: ${t.name}`,
        });
      }
      if (facts.length === 0) warnings.push("לא נמצאו רשומות רמ\"י תואמות לאזור");
    }
  } catch (e) {
    warnings.push(`שליפה מובנית נכשלה (${task.source}): ${(e as Error).message}`);
  }

  return { facts, warnings };
}
