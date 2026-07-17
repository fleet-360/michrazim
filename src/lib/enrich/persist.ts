import "server-only";
import { connectDB } from "@/server/db";
import { Comparable } from "@/server/models";
import { geocodeCity } from "@/lib/data/localities";
import type { FactCard } from "./types";

/**
 * Persist deal FactCards to the Comparable collection. Two deliberate differences
 * from importDealsAction (actions.ts:434):
 *   1. store provenance (`sourceUrl`, `quote`, `sourceKind`, `source:"web"`).
 *   2. NEVER recompute City.avgResidentialPricePerSqm — this layer emits only
 *      real facts, no computed anchors (explicit user requirement).
 * Upserts on a natural key to avoid piling duplicates across runs.
 */
export async function persistDealsToComparables(
  facts: FactCard[],
  fallbackCity?: string,
): Promise<{ inserted: number; skipped: number }> {
  const deals = facts.filter((f) => f.kind === "deal" && f.deal);
  if (deals.length === 0) return { inserted: 0, skipped: 0 };
  await connectDB();

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < deals.length; i++) {
    const f = deals[i];
    const d = f.deal!;
    const city = d.city ?? fallbackCity;
    const pricePerSqm =
      d.pricePerSqm || (d.totalPrice && d.sizeSqm ? Math.round(d.totalPrice / d.sizeSqm) : undefined);
    if (!pricePerSqm && !d.totalPrice) {
      skipped++;
      continue;
    }
    const geo = city ? geocodeCity(city) : null;
    const jitter = ((i * 53) % 40 - 20) / 5000;

    // Natural key: gush+helka+dealDate+totalPrice (fall back to address).
    const key = {
      gush: d.gush,
      helka: d.helka,
      dealDate: d.dealDate,
      totalPrice: d.totalPrice,
      address: d.address,
    };
    const doc = {
      city,
      neighborhood: d.neighborhood,
      address: d.address,
      lat: geo ? geo.lat + jitter : undefined,
      lng: geo ? geo.lng + jitter : undefined,
      dealDate: d.dealDate,
      pricePerSqm,
      totalPrice: d.totalPrice,
      sizeSqm: d.sizeSqm,
      rooms: d.rooms,
      floor: d.floor,
      yearBuilt: d.yearBuilt,
      propertyType: d.assetType ?? "דירה",
      source: "web",
      sourceKind: f.source,
      sourceUrl: f.sourceUrl,
      quote: f.quote,
    };
    await Comparable.updateOne(
      { ...key, source: "web" },
      { $set: doc },
      { upsert: true },
    );
    inserted++;
  }
  return { inserted, skipped };
}

/**
 * Convert FactCards into CustomEvidence candidate objects (custom-mode). Deal
 * facts map onto price/market fields; structured facts carry their own `fields`.
 * The shape matches EvidenceCandidate (custom-layers.ts) + a `sourceUrl`.
 */
export interface EnrichEvidenceCandidate {
  fieldKey: string;
  value: string | number;
  confidence: "high" | "medium" | "low";
  rawQuote?: string;
  sourceUrl?: string;
}

export function factsToEvidenceCandidates(
  facts: FactCard[],
  targetFieldKeys: string[],
): EnrichEvidenceCandidate[] {
  const keys = new Set(targetFieldKeys);
  const out: EnrichEvidenceCandidate[] = [];
  for (const f of facts) {
    // Explicit field mappings (structured facts).
    for (const fm of f.fields ?? []) {
      if (keys.size && !keys.has(fm.key)) continue;
      out.push({
        fieldKey: fm.key,
        value: fm.value,
        confidence: f.confidence,
        rawQuote: f.quote,
        sourceUrl: f.sourceUrl,
      });
    }
  }
  return out;
}
