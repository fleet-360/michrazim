import { safeJson } from "./http";

// Best-effort access to רשות המיסים real-estate deals via the nadlan.gov.il
// REST surface (community-reverse-engineered; may be geo-restricted). On any
// failure callers fall back to seeded comparables.

export interface LiveDeal {
  address: string;
  dealDate: string;
  pricePerSqm: number;
  totalPrice: number;
  sizeSqm: number;
  rooms?: number;
  source: "live";
}

const NADLAN_DEALS = "https://www.nadlan.gov.il/Nadlan.REST/Main/GetAssestAndDeals";

export async function fetchDealsByGush(gush: string, helka: string): Promise<LiveDeal[] | null> {
  const body = {
    ObjectID: "",
    CurrentLavel: 1,
    PageNo: 1,
    OrderByFilled: "DEALDATETIME",
    OrderByDescending: true,
    Gush: gush,
    Parcel: helka,
  };
  const json = await safeJson<{ AllResults?: Record<string, unknown>[] }>(NADLAN_DEALS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 8000,
  });
  const rows = json?.AllResults;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .map((r) => mapDeal(r))
    .filter((d): d is LiveDeal => d !== null)
    .slice(0, 25);
}

function mapDeal(r: Record<string, unknown>): LiveDeal | null {
  const total = num(r["DEALAMOUNT"]);
  const size = num(r["DEALNATURE"]);
  if (!total || !size) return null;
  return {
    address: String(r["FULLADRESS"] ?? r["DISPLAYADRESS"] ?? "—"),
    dealDate: String(r["DEALDATE"] ?? r["DEALDATETIME"] ?? ""),
    totalPrice: total,
    sizeSqm: size,
    pricePerSqm: Math.round(total / size),
    rooms: num(r["ASSETROOMNUM"]) || undefined,
    source: "live",
  };
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
