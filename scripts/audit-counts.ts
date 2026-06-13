const CKAN = "https://data.gov.il/api/3/action/datastore_search";
const DEV = "bf164a03-55c7-4bea-8740-66ce60a51a2c";
const PLAN = "99aad98f-2b54-4eea-834d-650b56389bf3";
async function total(res: string, filters?: any) {
  const p = new URLSearchParams({ resource_id: res, limit: "0" });
  if (filters) p.set("filters", JSON.stringify(filters));
  const r: any = await (await fetch(`${CKAN}?${p}`, { signal: AbortSignal.timeout(15000) })).json();
  return r?.result?.total ?? "?";
}
async function statuses() {
  const p = new URLSearchParams({ resource_id: DEV, limit: "500" });
  const r: any = await (await fetch(`${CKAN}?${p}`, { signal: AbortSignal.timeout(20000) })).json();
  const counts: Record<string, number> = {};
  for (const row of r.result.records) { const s = String(row.StatusDescription||"").trim(); counts[s]=(counts[s]||0)+1; }
  return counts;
}
(async () => {
  console.log("devcosts total:", await total(DEV));
  console.log("planning total:", await total(PLAN));
  console.log("devcosts במכרז:", await total(DEV, { StatusDescription: "במכרז" }));
  console.log("\n=== status distribution (sample 500 devcosts) ===");
  const c = await statuses();
  for (const [k,v] of Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(`  ${v}\t${k}`);
  process.exit(0);
})();
