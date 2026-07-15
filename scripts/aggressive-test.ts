/**
 * Aggressive end-to-end test of the multi-layer AI tender pipeline.
 * Replicates analyzeTenderUploadAction's steps (parse → locate → plans →
 * intelligence) against REAL tenders and asserts sanity of every layer.
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/aggressive-test.ts
 * (the react-server condition makes the `server-only` guard a no-op)
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import { parseTenderText } from "../src/lib/ai/insights";
import { fetchParcelByGushHelka } from "../src/lib/data/govmap";
import { fetchPlansAtPoint, fetchPlansByNumber, type PlanInfo } from "../src/lib/data/iplan";
import { geocodeCity } from "../src/lib/data/localities";
import { buildTenderIntelligence, type TenderLocationDTO, type TenderMarketDTO } from "../src/server/tender-estimate";
import { feeScheduleFor } from "../src/server/analysis";
import { SEED_CITIES } from "../src/server/seed-data";

const cities = SEED_CITIES as any;
const m = (n: number) => (n / 1e6).toFixed(2) + "M";
const k = (n: number) => Math.round(n).toLocaleString();

let failures: string[] = [];
let warnings: string[] = [];
function assert(tag: string, cond: boolean, msg: string) {
  if (!cond) failures.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "❌"} ${msg}`);
}
function soft(tag: string, cond: boolean, msg: string) {
  if (!cond) warnings.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "⚠️ "} ${msg}`);
}

function marketFor(city: string): TenderMarketDTO | null {
  const row = cities.find((c: any) => c.name === city);
  const schedule = feeScheduleFor(city, cities);
  return {
    city,
    avgPricePerSqm: row?.avgResidentialPricePerSqm ?? 26000,
    priceSource: row?.avgResidentialPricePerSqm ? "city-db" : "default",
    fees: {
      buildingFeePerSqm: schedule.buildingFeePerSqm,
      sewageLevyPerSqm: schedule.sewageLevyPerSqm,
      waterLevyPerSqm: schedule.waterLevyPerSqm,
      roadsLevyPerSqm: schedule.roadsLevyPerSqm,
      drainageLevyPerSqm: schedule.drainageLevyPerSqm,
      openSpaceLevyPerSqm: schedule.openSpaceLevyPerSqm,
    },
    feesSource: row ? "city-db" : "default",
  };
}

/** Mirror of the action's locate step (parcel → city centroid). */
async function locate(tender: any): Promise<TenderLocationDTO | null> {
  if (tender.gush && tender.helka) {
    const parcel = await fetchParcelByGushHelka(tender.gush, tender.helka);
    if (parcel) {
      return {
        lat: parcel.centroid[1],
        lng: parcel.centroid[0],
        areaSqm: Math.round(parcel.areaSqm),
        origin: "parcel",
        gush: tender.gush,
        helka: tender.helka,
      };
    }
  }
  if (tender.city) {
    const c = geocodeCity(tender.city);
    if (c) return { lat: c.lat, lng: c.lng, origin: "city", gush: tender.gush, helka: tender.helka };
  }
  return null;
}

async function plansFor(tender: any, location: TenderLocationDTO | null): Promise<PlanInfo[]> {
  let plans: PlanInfo[] = [];
  if (location) plans = await fetchPlansAtPoint(location.lat, location.lng);
  if (tender.planNumber) {
    const byNumber = await fetchPlansByNumber(tender.planNumber);
    const seen = new Set(byNumber.map((p) => p.planNumber));
    plans = [...byNumber, ...plans.filter((p) => !seen.has(p.planNumber))];
  }
  return plans;
}

async function runPipeline(tag: string, text: string) {
  console.log(`\n════════ ${tag} ════════`);
  const tender = await parseTenderText(text);
  if (!tender) {
    console.log("  parse → null");
    return { tender: null } as const;
  }
  console.log("  parsed:", JSON.stringify(tender));
  const location = await locate(tender);
  const plans = await plansFor(tender, location);
  console.log(`  location: ${location?.origin ?? "none"}${location?.areaSqm ? ` (${location.areaSqm} מ"ר)` : ""} | plans: ${plans.length}`);
  const market = tender.city ? marketFor(tender.city) : null;
  const intel = await buildTenderIntelligence({ tender, plans, location, market, cities, runs: 3000 });
  const e = intel.estimate;
  if (intel.planCuration) {
    console.log(`  curation: kept ${intel.planCuration.kept.map((p) => `${p.planNumber}(${p.role})`).join(", ")} | dropped ${intel.planCuration.droppedCount}`);
  } else console.log("  curation: null");
  if (intel.assumptions) {
    const a = intel.assumptions;
    console.log(`  assumptions: ${a.typology} | units ${a.unitsForModel} | far ${a.farForModel} | sale ${k(a.salePricePerSqm)}/מ"ר (${a.confidence}) — ${a.salePriceRationale}`);
    console.log(`    knobs: cc=${a.constructionCostPerSqm ?? "-"} parking=${a.parkingCostPerSpace ?? "-"} betterment=${a.bettermentLevyILS ?? "-"} service=${a.serviceAreaRatio ?? "-"} avgUnit=${a.avgUnitSizeSqm ?? "-"} margin=${a.requiredMargin ?? "-"} obligations=${a.extraObligationsILS ?? "-"}`);
    a.cautions.forEach((c) => console.log(`    ⚠ ${c}`));
  } else console.log("  assumptions: null");
  if (e) {
    console.log(`  estimate[${e.method}/${e.typology}]: RLV ${m(e.maxLandValue)} | bid ${m(e.recommendedBid)} | profit ${m(e.expectedProfit)} | margin ${(e.marginOnCost * 100).toFixed(1)}% | pLoss ${(e.probabilityOfLoss * 100).toFixed(0)}% | units ${e.units} | verdict ${e.verdict}`);
    console.log(`    reason: ${e.verdictReason}`);
  } else console.log("  estimate: null");
  if (intel.minPriceComparison) {
    const c = intel.minPriceComparison;
    console.log(`  min-price: min ${k(c.minPrice)} vs RLV ${k(c.maxLandValue)} → headroom ${(c.headroomPct * 100).toFixed(0)}%`);
  } else console.log("  min-price comparison: none");
  if (intel.review) {
    console.log(`  critic: blocking=${intel.review.blocking} | ${intel.review.summary}`);
    intel.review.issues.forEach((i) => console.log(`    • ${i}`));
  } else console.log("  critic: null");
  intel.warnings.forEach((w) => console.log(`  ⚠ pipeline warning: ${w}`));
  return { tender, location, plans, intel } as const;
}

async function main() {
  /* ─────────── CASE A: קרית מלאכי 290/2024 — בנה ביתך עם זכויות מפורשות ─────────── */
  // Ground truth (rmiclick): מגרש 130, 320 m², rights 160+88, appraisal ₪887,812,
  // WINNING BID ₪1,229,778 (+38.5%), dev ₪632,382, ~59 bids.
  const rA = await runPipeline(
    "A: קרית מלאכי 290/2024 — בנה ביתך, זכויות 160+88 (אמת: זכייה 1.23M)",
    `מכרז פומבי מס' 290/2024 – קרית מלאכי: הזמנה לקבלת הצעות לחכירת מגרשים לבנייה עצמית של יח"ד צמודת קרקע (בנה ביתך), בתחום תכנית 160/02/18.
מגרש 130 בשטח 320 מ"ר — יחידת דיור אחת.
זכויות בנייה: 160 מ"ר שטח עיקרי + 88 מ"ר שטחי שירות, בשתי קומות מעל קומת מרתף.
מחיר מינימום: 887,812 ש"ח. הוצאות פיתוח למגרש: 632,382 ש"ח.
מועד אחרון להגשת הצעות: 21/04/2025.`,
  );
  {
    const t = rA.tender!, i = rA.intel!;
    assert("A", t?.mainRightsSqm === 160 && t?.serviceRightsSqm === 88, `rights parsed 160+88 (${t?.mainRightsSqm}+${t?.serviceRightsSqm})`);
    assert("A", i.estimate?.typology === "SINGLE_FAMILY", `typology (${i.estimate?.typology})`);
    assert("A", i.estimate?.farSource === "rights", `house size from stated rights (${i.estimate?.farSource})`);
    const house = i.estimate?.houseSqm ?? 0;
    assert("A", house >= 160 && house <= 240, `house ≈ rights 160+0.45×88≈200 (${house})`);
    const rlv = i.estimate?.maxLandValue ?? NaN;
    // Truth: appraisal 888K, cleared at 1.23M (59 family bidders — winner's
    // curse territory). A rational-investor RLV below that is defensible; only
    // flag when it collapses to noise.
    soft("A", rlv >= 300_000 && rlv <= 2_200_000, `RLV in a rational band vs appraisal ₪888K / clearing ₪1.23M (${m(rlv)})`);
    assert("A", !!i.minPriceComparison, "min-price comparison present");
    assert("A", i.estimate?.units === 1, `units=1 (${i.estimate?.units})`);
    soft("A", !!i.analyst?.headline && i.analyst.keyFactors.length >= 3, `analyst brief with ranked factors (${i.analyst?.keyFactors.length ?? 0})`);
  }

  /* ─────────── CASE B: באר שבע 219/2023 — מחיר מטרה בפריפריה (רוב המתחמים נכשלו) ─────────── */
  // Ground truth (ramibox): מתחם 61369 — 14,043 m², 156 units, min ₪2,642,026,
  // dev ₪37,444,508, WINNING BID ₪20,088,729. 6 of 7 compounds got NO bids.
  const rB = await runPipeline(
    "B: באר שבע 219/2023 פסגת רמות — מחיר מטרה 156 יח\"ד (אמת: זכייה 20.1M)",
    `מכרז פומבי מס' בש/219/2023 – באר שבע, שכונת פסגת רמות, מסלול "מחיר מטרה".
מתחם 61369: מגרשים 117א' ו-119א', גוש 38419 חלקות 34-35, בשטח 14,043 מ"ר, לבניית 156 יח"ד בבנייה רוויה, בתחום תכנית 605-0543108.
מחיר מינימום למתחם: 2,642,026 ש"ח. הוצאות פיתוח: 37,444,508 ש"ח.
רוב יחידות הדיור ישווקו לזכאים במחיר מטרה בהנחה ממחיר השוק, בהתאם להחלטות מועצת מקרקעי ישראל.
מועד אחרון להגשת הצעות: 27/09/2023.`,
  );
  {
    const t = rB.tender!, i = rB.intel!;
    assert("B", /מטרה/.test(t?.specialTrack ?? ""), `special track detected (${t?.specialTrack})`);
    assert("B", i.estimate?.units === 156, `units echo 156 (${i.estimate?.units})`);
    const rlv = i.estimate?.maxLandValue ?? NaN;
    assert("B", Number.isFinite(rlv), "RLV finite");
    // Truth: ONE compound cleared at 20.1M while 6 of 7 got ZERO bids at
    // similar minimums — the market itself mostly said "not viable". A
    // negative-to-modest RLV is the honest zone.
    soft("B", rlv >= -35_000_000 && rlv <= 60_000_000, `RLV in plausible band (truth: 1 win ₪20.1M, 6/7 no bids) (${m(rlv)})`);
    soft("B", (i.assumptions?.salePricePerSqm ?? 99999) <= 15500, `target-price discount applied vs anchor 15.5K (${k(i.assumptions?.salePricePerSqm ?? 0)})`);
    assert("B", !!i.minPriceComparison, "min-price comparison present");
  }

  /* ─────────── CASE C: ת"א 284/2024 שדה דב — השכרה מפוקחת עם זכויות ─────────── */
  // Ground truth (rmiclick): plot 7,067 m², 424 rental units, rights 27,322+13,224,
  // dev ₪56,257,896, NO min price, appraisal ₪304.65M, WINNING BID ₪191.1M (-37%).
  const rC = await runPipeline(
    "C: ת\"א 284/2024 שדה דב — השכרה 424 יח\"ד (אמת: זכייה 191M, שומה 305M)",
    `מכרז מקוון מס' תא/284/2024 – רשות מקרקעי ישראל, מרחב תל אביב: דיור להשכרה לטווח ארוך ברובע שדה דב א', תל אביב-יפו.
מגרש 2102 בתחום תכנית 507-0915108, בשטח של 7,067 מ"ר, לבניית 424 יח"ד להשכרה ארוכת טווח, מתוכן 50% בשכר דירה מפוקח.
זכויות בנייה: 27,322 מ"ר שטח עיקרי + 13,224 מ"ר שטחי שירות.
הוצאות פיתוח: 56,257,896 ש"ח (לא כולל מע"מ). לא נקבע מחיר מינימום למגרש.
מועד אחרון להגשת הצעות: 19/02/2025.`,
  );
  {
    const t = rC.tender!, i = rC.intel!;
    assert("C", /השכרה/.test(t?.specialTrack ?? ""), `rental track detected (${t?.specialTrack})`);
    assert("C", t?.mainRightsSqm === 27322, `main rights parsed (${t?.mainRightsSqm})`);
    assert("C", i.estimate?.farSource === "rights", `FAR from stated rights (${i.estimate?.farSource}, far=${i.estimate?.farUsed})`);
    assert("C", i.estimate?.units === 424, `units echo 424 (${i.estimate?.units})`);
    const rlv = i.estimate?.maxLandValue ?? NaN;
    // Sale-appraisal was 305M; rental cleared 191M. Model (rental-discounted) sane: 100M-450M.
    soft("C", rlv >= 100_000_000 && rlv <= 450_000_000, `RLV in the appraisal/deal zone 191-305M (${m(rlv)})`);
    assert("C", i.estimate?.verdict !== "GO", `rental never a confident GO (${i.estimate?.verdict})`);
  }

  /* ─────────── CASE D: מודיעין מרכז — מכרז שנכשל פעמיים (אמת: אפס הצעות) ─────────── */
  // Ground truth: min ₪120M, appraisal ₪289.3M, dev ₪26M + obligation to build
  // ~4,000 m² office shell for Israel Railways. NO BIDS twice.
  const rD = await runPipeline(
    "D: מודיעין מרכז — 125 יח\"ד מעל תחנת רכבת (אמת: נכשל פעמיים, אפס הצעות)",
    `מכרז משותף לרשות מקרקעי ישראל ורכבת ישראל: שיווק קרקע בשטח של כ-7,000 מ"ר מעל תחנת הרכבת מודיעין מרכז, להקמת 125 יח"ד למכירה בשוק החופשי לצד שטחי מסחר ותעסוקה, מודיעין-מכבים-רעות.
מחיר מינימום: 120,000,000 ש"ח. הוצאות פיתוח: 26,000,000 ש"ח.
תנאים מיוחדים: הזוכה נדרש להקים כ-4,000 מ"ר משרדים ברמת מעטפת עבור רכבת ישראל, לשאת בתכנון המפורט ובהיתרים, ובאחריות לנזקים לתחנה הפעילה במהלך הבנייה.
מועד אחרון להגשת הצעות: 20/05/2025.`,
  );
  {
    const i = rD.intel!;
    const e = i.estimate;
    assert("D", !!e, "estimate produced");
    // Reality: zero bids at 120M minimum. The tool must NOT say GO.
    assert("D", e?.verdict !== "GO", `not GO on a tender that failed twice (${e?.verdict})`);
    const headroom = i.minPriceComparison?.headroomPct;
    soft("D", headroom !== undefined && headroom < 0.5, `thin/negative headroom vs 120M minimum (${headroom !== undefined ? (headroom * 100).toFixed(0) + "%" : "n/a"})`);
    soft("D", (i.assumptions?.extraObligationsILS ?? 0) > 0, `special obligations costed (${m(i.assumptions?.extraObligationsILS ?? 0)})`);
  }

  /* ─────────── CASE E (regression): באר שבע 125/2024 מגרש בודד ─────────── */
  // RMI tender 125/2024, Rakafot Beer Sheva, parcel 4271. Ground truth:
  // min ₪90,495, dev ₪779,422, WINNING BID ₪709,761 (published result).
  const r1 = await runPipeline(
    "1: מכרז 125/2024 באר שבע — מגרש בודד (אמת מלאה)",
    `רשות מקרקעי ישראל — מרחב עסקי דרום
מכרז מס' 125/2024 להחכרת מגרשים לבנייה נמוכה/צמודת קרקע בשכונת רקפות, באר שבע.
תכנית: תמל/1016. מועד אחרון להגשה: 26/08/2024.
מגרש מס' 4271, גוש 38758 חלקה 37. שטח המגרש: 567 מ"ר. יעוד: מגורים, יחידת דיור אחת.
מחיר מינימום (לא כולל מע"מ): 90,495 ש"ח. הוצאות פיתוח: 779,422 ש"ח.
המחיר אינו כולל היטלים ואגרות החלים על הזוכה.`,
  );
  {
    const t = r1.tender!, i = r1.intel!;
    assert("1", t?.gush === "38758" && t?.helka === "37", `parse gush/helka (${t?.gush}/${t?.helka})`);
    assert("1", t?.plotAreaSqm === 567, `parse plot 567 (${t?.plotAreaSqm})`);
    assert("1", t?.minPrice === 90495, `parse minPrice 90,495 (${t?.minPrice})`);
    assert("1", t?.developmentCost === 779422, `parse devCost 779,422 (${t?.developmentCost})`);
    assert("1", (t?.units ?? 0) === 1, `parse units 1 (${t?.units})`);
    assert("1", r1.location?.origin === "parcel", `cadastral parcel found (${r1.location?.origin})`);
    // curation
    soft("1", !!i.planCuration, "plan curation returned");
    if (i.planCuration) {
      const keptNums = i.planCuration.kept.map((p) => p.planNumber).join(" ");
      const junkKept = r1.plans!.filter((p) => i.planCuration!.kept.some((kp) => kp.planNumber === p.planNumber) && /בדיקת|מפת רקע|ביתני מכירה/.test(p.name ?? ""));
      assert("1", junkKept.length === 0, `junk/test layers filtered out (kept: ${keptNums})`);
      soft("1", /1016/.test(keptNums), `the tender's own plan תמל/1016 kept (${keptNums})`);
    }
    // assumptions
    assert("1", i.assumptions?.typology === "SINGLE_FAMILY", `typology SINGLE_FAMILY (${i.assumptions?.typology})`);
    assert("1", i.assumptions?.unitsForModel === 1, `assumptions echo 1 unit (${i.assumptions?.unitsForModel})`);
    soft("1", (i.assumptions?.salePricePerSqm ?? 0) >= 8000 && (i.assumptions?.salePricePerSqm ?? 0) <= 25000, `sale price sane for B7 single-family (${k(i.assumptions?.salePricePerSqm ?? 0)})`);
    // estimate
    assert("1", i.estimate?.method === "single-family", `single-family model used (${i.estimate?.method})`);
    assert("1", i.estimate?.units === 1, `estimate shows 1 unit, not 8/14 (${i.estimate?.units})`);
    const rlv = i.estimate?.maxLandValue ?? NaN;
    assert("1", Number.isFinite(rlv) && rlv > 0, `RLV positive & finite (${m(rlv)})`);
    soft("1", rlv >= 100_000 && rlv <= 3_000_000, `RLV magnitude sane vs winning bid ₪710K (${m(rlv)})`);
    assert("1", !!i.minPriceComparison, "min-price comparison computed");
    soft("1", (i.minPriceComparison?.headroomPct ?? -1) > 0, `headroom above minimum (${((i.minPriceComparison?.headroomPct ?? 0) * 100).toFixed(0)}%)`);
    assert("1", i.estimate?.verdict !== "NO_GO", `not the old nonsense NO_GO (${i.estimate?.verdict})`);
    soft("1", !i.review?.blocking, "critic does not block");
  }

  /* ─────────────────── CASE 2: real multi-family, periphery ─────────────────── */
  // data.gov.il record _id 3: Mitzpe Ramon "מעוף" 75 units, dev ₪11,274,376.
  const r2 = await runPipeline(
    "2: מצפה רמון מעוף — 75 יח\"ד (data.gov.il)",
    `רשות מקרקעי ישראל — מכרז פומבי לבניה רוויה
אתר מעוף, מצפה רמון. מגרשים 138-144, 167-174, 416, 430.
סך הכל 75 יחידות דיור בבניה רוויה.
הוצאות פיתוח (כולל מוסדות ציבור): 11,274,376 ש"ח.
מדד מכרז: 04/2026. עיר: מצפה רמון.`,
  );
  {
    const i = r2.intel!;
    assert("2", i.assumptions?.typology === "MULTI_FAMILY" || !i.assumptions, `typology MULTI_FAMILY (${i.assumptions?.typology})`);
    assert("2", i.estimate?.units === 75, `estimate echoes 75 units (${i.estimate?.units})`);
    soft("2", (i.assumptions?.salePricePerSqm ?? 0) >= 7000 && (i.assumptions?.salePricePerSqm ?? 0) <= 17000, `Mitzpe Ramon sale price sane (${k(i.assumptions?.salePricePerSqm ?? 0)})`);
    const e = i.estimate;
    assert("2", !!e && Number.isFinite(e.maxLandValue) && Number.isFinite(e.expectedProfit), "all numbers finite");
    assert("2", !!e && e.probabilityOfLoss >= 0 && e.probabilityOfLoss <= 1, `pLoss in [0,1] (${e?.probabilityOfLoss})`);
    // A genuinely-subsidized periphery deal MAY be uneconomic — but then the
    // report must explain it, not read like a broken model.
    const explained = /סבסוד|מחיר מטרה|אינו כלכלי/.test(e?.verdictReason ?? "");
    soft("2", !!e && (e.probabilityOfLoss < 1 || explained), `pLoss=100% only with honest explanation (${((e?.probabilityOfLoss ?? 1) * 100).toFixed(0)}%, explained=${explained})`);
    // The RLV shouldn't be a huge negative after the cost structure is tuned to
    // the location (surface parking, no betterment on RMI marketing tenders).
    soft("2", (e?.maxLandValue ?? -1e9) > -30_000_000, `RLV not wildly negative after repair (${m(e?.maxLandValue ?? 0)})`);
    soft("2", !i.review?.blocking, "critic accepts the final result");
  }

  /* ─────────────────── CASE 4: junk input degrades gracefully ─────────────────── */
  const r4 = await runPipeline("4: טקסט זבל", "שלום מה נשמע? מתכון לשקשוקה: עגבניות, ביצים, פלפל חריף. לערבב הכל במחבת.");
  {
    const ok = !r4.tender || (!r4.tender.city && !r4.tender.minPrice);
    assert("4", ok, `junk text → no fabricated tender (${JSON.stringify(r4.tender ?? null)})`);
  }

  /* ─────────────────── SUMMARY ─────────────────── */
  console.log("\n════════ סיכום ════════");
  console.log(failures.length ? `❌ ${failures.length} כשלים:` : "✅ אפס כשלים קשיחים");
  failures.forEach((f) => console.log("  - " + f));
  console.log(warnings.length ? `⚠️  ${warnings.length} אזהרות רכות:` : "✅ אפס אזהרות");
  warnings.forEach((w) => console.log("  - " + w));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS CRASHED:", e);
  process.exit(2);
});
