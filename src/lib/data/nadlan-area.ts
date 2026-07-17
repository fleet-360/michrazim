import "server-only";
import { govmapObjectId } from "./govmap";
import type { ParcelIdentity, FactCard } from "@/lib/enrich/types";

/**
 * Official רשות המיסים (nadlan.gov.il) AREA market data — median prices by room
 * count, rental yield, and the annual price-trend %. Unlike the individual
 * transaction list (which sits behind reCAPTCHA on api.nadlan.gov.il/deal-data),
 * these aggregates are published as static JSON on data.nadlan.gov.il with no
 * bot-gate, so a plain server fetch works. This is government-published data, not
 * a computed anchor — it carries a nadlan sourceUrl + verbatim quote and is emitted
 * as a `context` FactCard.
 */

const AREA_BASE = "https://data.nadlan.gov.il/api/pages";

interface RoomTrend {
  numRooms?: number | string;
  hasDeals?: number;
  summary?: { lastYearAvgPrice?: number; priceDifferencePercentage?: number | string };
}
interface AreaJson {
  settlementID?: number;
  settlementName?: string;
  neighborhoodID?: number;
  neighborhoodName?: string;
  trends?: {
    rooms?: RoomTrend[] | Record<string, RoomTrend>;
    indexes?: { priceIncreases?: number; yield?: number; luxury?: number };
  };
}

/** Fetch a static nadlan page JSON (handles the UTF-8 BOM these files carry). */
async function fetchAreaJson(url: string, timeoutMs = 12_000): Promise<AreaJson | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Referer: "https://www.nadlan.gov.il/",
        Accept: "application/json, text/plain, */*",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const text = (await res.text()).replace(/^﻿/, "");
    return JSON.parse(text) as AreaJson;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;
const pct = (v: number | string | undefined) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return `${n > 0 ? "+" : ""}${n}%`;
};

function normalizeRooms(rooms: RoomTrend[] | Record<string, RoomTrend> | undefined): RoomTrend[] {
  if (!rooms) return [];
  return Array.isArray(rooms) ? rooms : Object.values(rooms);
}

/** Build a `context` FactCard from one area JSON (settlement or neighborhood). */
function toFactCard(
  json: AreaJson,
  level: "settlement" | "neighborhood",
  sourceUrl: string,
): FactCard | null {
  const rooms = normalizeRooms(json.trends?.rooms).filter((r) => r.summary?.lastYearAvgPrice);
  const idx = json.trends?.indexes;
  if (!rooms.length && !idx?.yield && !idx?.priceIncreases) return null;

  const name =
    level === "neighborhood"
      ? json.neighborhoodName ?? json.settlementName ?? "האזור"
      : json.settlementName ?? "היישוב";

  const all = rooms.find((r) => r.numRooms === "all" || r.numRooms === undefined);
  const byRoom = rooms
    .filter((r) => r.numRooms !== "all" && r.numRooms !== undefined)
    .sort((a, b) => Number(a.numRooms) - Number(b.numRooms));

  const fields: { key: string; value: string | number }[] = [];
  if (all?.summary?.lastYearAvgPrice)
    fields.push({ key: "מחיר חציוני (כל החדרים)", value: ils(all.summary.lastYearAvgPrice) });
  for (const r of byRoom)
    if (r.summary?.lastYearAvgPrice)
      fields.push({ key: `${r.numRooms} חדרים`, value: ils(r.summary.lastYearAvgPrice) });
  if (idx?.yield !== undefined) fields.push({ key: "תשואת שכירות שנתית", value: `${idx.yield}%` });
  const yoy = pct(idx?.priceIncreases);
  if (yoy) fields.push({ key: "שינוי מחירים שנתי", value: yoy });

  if (!fields.length) return null;

  const levelLabel = level === "neighborhood" ? "שכונה" : "יישוב";
  const quote = `נתוני רשות המיסים — ${name} (${levelLabel}): ${fields
    .map((f) => `${f.key} ${f.value}`)
    .join(" · ")}`;

  return {
    taskId: "",
    kind: "context",
    source: "nadlan",
    sourceUrl,
    quote: quote.slice(0, 400),
    fetchedAt: new Date().toISOString(),
    confidence: "high",
    label: `נתוני שוק רשמיים (רשות המיסים) — ${name}`,
    fields,
  };
}

/**
 * Fetch official nadlan area market data for a parcel: settlement-level always
 * (reliable), plus neighborhood-level when the neighborhood resolves (tighter).
 * Never throws — returns whatever resolved, with warnings for the rest.
 */
export async function fetchNadlanAreaStats(input: {
  identity: ParcelIdentity;
  onProgress?: (msg: string) => void;
}): Promise<{ facts: FactCard[]; warnings: string[] }> {
  const { identity } = input;
  const facts: FactCard[] = [];
  const warnings: string[] = [];
  const city = (identity.city ?? "").trim();
  if (!city) return { facts, warnings: ["אין שם יישוב לשליפת נתוני אזור"] };

  input.onProgress?.("שולף נתוני שוק רשמיים מרשות המיסים…");

  // Settlement level — the reliable base.
  const setlCode = await govmapObjectId(city, "SETTLEMENT").catch(() => null);
  if (setlCode) {
    const json = await fetchAreaJson(`${AREA_BASE}/settlement/buy/${setlCode}.json`);
    if (json) {
      const url = `https://www.nadlan.gov.il/?view=settlement&id=${setlCode}&page=deals`;
      const fc = toFactCard(json, "settlement", url);
      if (fc) facts.push(fc);
    }
  }

  // Neighborhood level — tighter comps when the neighborhood is known/resolvable.
  const hood = (identity.neighborhood ?? "").trim();
  if (hood) {
    const neighId = await govmapObjectId(`${hood} ${city}`, "NEIGHBORHOOD").catch(() => null);
    if (neighId) {
      const json = await fetchAreaJson(`${AREA_BASE}/neighborhood/buy/${neighId}.json`);
      if (json) {
        const url = `https://www.nadlan.gov.il/?view=neighborhood&id=${neighId}&page=deals`;
        const fc = toFactCard(json, "neighborhood", url);
        if (fc) facts.push(fc);
      }
    }
  }

  if (!facts.length) warnings.push("רשות המיסים: לא נמצאו נתוני שוק לאזור");
  else input.onProgress?.(`נאספו נתוני שוק רשמיים (${facts.length})`);
  return { facts, warnings };
}
