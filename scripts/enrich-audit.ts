/**
 * Deep audit: exercise EVERY external source the enrichment layer touches, via the
 * real code functions, and report pass/fail. Run:
 * NODE_OPTIONS=--conditions=react-server npx tsx scripts/enrich-audit.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import { govmapObjectId, govmapLocateForDeals, fetchParcelByGushHelka } from "../src/lib/data/govmap";
import { fetchNadlanAreaStats } from "../src/lib/data/nadlan-area";
import { fetchPlansAtPoint, fetchPlansByNumber } from "../src/lib/data/iplan";
import { getLiveTenders } from "../src/lib/data/rmi";

const line = (s: string) => console.log(s);
async function timed<T>(fn: () => Promise<T>): Promise<[T | null, number, string]> {
  const t = Date.now();
  try { const r = await fn(); return [r, Date.now() - t, ""]; }
  catch (e) { return [null, Date.now() - t, (e as Error).message.slice(0, 80)]; }
}

// Real demo-tender-ish identities.
const CASES = [
  { tag: "שדרות (יישוב, בניה רוויה)", city: "שדרות", neighborhood: "", gush: "", helka: "", lat: 31.525, lng: 34.596, planNumber: "תמל/1211" },
  { tag: "דימונה (בנה ביתך)", city: "דימונה", neighborhood: "", gush: "", helka: "", lat: 31.070, lng: 35.033, planNumber: "" },
  { tag: "אלעד (תעסוקה/מסחר, 0 יחד)", city: "אלעד", neighborhood: "", gush: "", helka: "", lat: 32.051, lng: 34.951, planNumber: "" },
  { tag: "באר שבע רקפות (צמוד קרקע)", city: "באר שבע", neighborhood: "רקפות", gush: "38758", helka: "37", lat: 31.223, lng: 34.788, planNumber: "תמל/1016" },
];

async function main() {
  for (const c of CASES) {
    line(`\n════════ ${c.tag} ════════`);

    // 1. govmap geocode/locate (es.govmap.gov.il/TldSearch)
    const [setl, tSetl] = await timed(() => govmapObjectId(c.city, "SETTLEMENT"));
    line(`  govmap SETTLEMENT("${c.city}")            → ${setl ?? "∅"}  (${tSetl}ms)`);
    if (c.neighborhood) {
      const [nb] = await timed(() => govmapObjectId(`${c.neighborhood} ${c.city}`, "NEIGHBORHOOD"));
      line(`  govmap NEIGHBORHOOD("${c.neighborhood} ${c.city}") → ${nb ?? "∅"}`);
    }
    const [loc] = await timed(() => govmapLocateForDeals(c.neighborhood ? `${c.neighborhood} ${c.city}` : c.city));
    line(`  govmapLocateForDeals                     → ${loc ? JSON.stringify(loc) : "∅"}`);

    // 2. nadlan area stats (data.nadlan.gov.il)
    const [area, tArea] = await timed(() => fetchNadlanAreaStats({ identity: c as any }));
    line(`  nadlan AREA stats                        → ${area?.facts.length ?? 0} facts  warn=${JSON.stringify(area?.warnings ?? [])}  (${tArea}ms)`);

    // 3. iplan XPlan (ags.iplan.gov.il) — by point + by planNumber
    if (c.lat) {
      const [byPt, tPt, ePt] = await timed(() => fetchPlansAtPoint(c.lat, c.lng));
      line(`  iplan fetchPlansAtPoint                  → ${byPt?.length ?? 0} plans  (${tPt}ms)${ePt ? " ERR:" + ePt : ""}`);
    }
    if (c.planNumber) {
      const [byNum, tNum, eNum] = await timed(() => fetchPlansByNumber(c.planNumber));
      line(`  iplan fetchPlansByNumber("${c.planNumber}")     → ${byNum?.length ?? 0} plans  (${tNum}ms)${eNum ? " ERR:" + eNum : ""}`);
    }

    // 4. govmap parcel geometry (open.govmap.gov.il geoserver)
    if (c.gush && c.helka) {
      const [parcel, tPar, ePar] = await timed(() => fetchParcelByGushHelka(c.gush, c.helka));
      line(`  govmap PARCEL_ALL(${c.gush}/${c.helka})           → ${parcel ? parcel.origin + " " + Math.round(parcel.areaSqm) + "m²" : "∅"}  (${tPar}ms)${ePar ? " ERR:" + ePar : ""}`);
    }

    // 5. RMI datasets (data.gov.il CKAN)
    const [rmi, tRmi, eRmi] = await timed(() => getLiveTenders({ q: c.city, limit: 200 }));
    line(`  RMI getLiveTenders                       → ${rmi?.length ?? 0} tenders  (${tRmi}ms)${eRmi ? " ERR:" + eRmi : ""}`);
  }
}
main().catch((e) => { console.error("crash:", e); process.exit(1); });
