// Approximate centroids for Israeli localities (WGS84) — used to plot live RMI
// tenders on the map. Not exhaustive; unmatched localities show in lists only.
export const LOCALITIES: Record<string, [number, number]> = {
  "תל אביב-יפו": [32.0853, 34.7818],
  "תל אביב": [32.0853, 34.7818],
  ירושלים: [31.7683, 35.2137],
  חיפה: [32.794, 34.9896],
  "ראשון לציון": [31.973, 34.7925],
  "פתח תקווה": [32.0917, 34.8854],
  אשדוד: [31.8014, 34.6435],
  נתניה: [32.3215, 34.8532],
  "באר שבע": [31.252, 34.7915],
  "בני ברק": [32.0807, 34.8338],
  חולון: [32.0117, 34.7722],
  "רמת גן": [32.068, 34.8248],
  אשקלון: [31.6688, 34.5743],
  "רחובות": [31.8928, 34.8113],
  "בת ים": [32.0171, 34.7457],
  "בית שמש": [31.7497, 34.9886],
  "כפר סבא": [32.175, 34.907],
  הרצליה: [32.1624, 34.8443],
  חדרה: [32.4365, 34.9196],
  "מודיעין מכבים רעות": [31.8983, 35.0104],
  מודיעין: [31.8983, 35.0104],
  נצרת: [32.6996, 35.3035],
  לוד: [31.9510, 34.8953],
  רמלה: [31.9288, 34.8667],
  "רעננה": [32.1848, 34.8713],
  "ראש העין": [32.0956, 34.9568],
  "גבעתיים": [32.0723, 34.8104],
  "קריית גת": [31.61, 34.7642],
  "קריית אתא": [32.8064, 35.1129],
  "קריית מוצקין": [32.8386, 35.0742],
  "קריית ביאליק": [32.8273, 35.0876],
  "קריית ים": [32.8480, 35.0686],
  עפולה: [32.6078, 35.2897],
  "אופקים": [31.3147, 34.6203],
  נתיבות: [31.4222, 34.5951],
  שדרות: [31.5249, 34.5963],
  דימונה: [31.0686, 35.0327],
  "אילת": [29.5577, 34.9519],
  "טבריה": [32.7959, 35.5300],
  "צפת": [32.9646, 35.4960],
  "כרמיאל": [32.9171, 35.3047],
  "נהריה": [33.0085, 35.0980],
  עכו: [32.9281, 35.0818],
  "מגדל העמק": [32.6754, 35.2406],
  "יבנה": [31.8772, 34.7396],
  "נס ציונה": [31.9293, 34.7986],
  "אור יהודה": [32.0306, 34.8516],
  "יהוד": [32.0336, 34.8917],
  "רמת השרון": [32.1462, 34.8395],
  "הוד השרון": [32.1500, 34.8880],
  "קריית אונו": [32.0556, 34.8550],
  "גבעת שמואל": [32.0786, 34.8487],
  "אריאל": [32.1058, 35.1869],
  "מעלה אדומים": [31.7726, 35.2980],
  "ביתר עילית": [31.6960, 35.1146],
  "מודיעין עילית": [31.9303, 35.0414],
  "אלעד": [32.0520, 34.9520],
  "טירת כרמל": [32.7600, 34.9720],
  "נשר": [32.7656, 35.0440],
  "יקנעם עילית": [32.6592, 35.1100],
  "כפר יונה": [32.3170, 34.9360],
  "אום אל פחם": [32.5197, 35.1522],
  "טמרה": [32.8511, 35.2078],
  "סחנין": [32.8647, 35.2972],
  "מעלות תרשיחא": [33.0167, 35.2700],
  "בית שאן": [32.4969, 35.4999],
  "קצרין": [32.9911, 35.6896],
  "גן יבנה": [31.7869, 34.7050],
  "פרדס חנה כרכור": [32.4736, 34.9747],
  "זכרון יעקב": [32.5731, 34.9518],
  "מבשרת ציון": [31.7990, 35.1500],
  "גדרה": [31.8133, 34.7794],
  "כפר קאסם": [32.1147, 34.9772],
  "טייבה": [32.2660, 35.0100],
};

import { CBS_BY_CODE, CBS_BY_NAME } from "./cbs-localities";

function normalizeName(name: string): string {
  return name
    .replace(/["׳״']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-–]/g, " ")
    .trim();
}

/** Tight normalization matching scripts/gen-localities.ts (strips quotes/hyphens/all spaces). */
const normTight = (s: string) => s.replace(/["'`׳״\-\s]/g, "");

/**
 * Ktiv male ↔ ktiv haser: CBS spells "קריית/הרצלייה/נהרייה" (double yod) while
 * tender booklets usually write "קרית/הרצליה/נהריה". Collapsing double-yod on
 * both sides makes the lookup spelling-agnostic. Built lazily once.
 */
const collapseYod = (s: string) => normTight(s).replace(/יי/g, "י");
let COLLAPSED_BY_NAME: Record<string, [number, number]> | null = null;

const NORMALIZED: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(LOCALITIES).map(([k, v]) => [normalizeName(k), v]),
);

/**
 * Geocode an Israeli locality to WGS84. Prefers the exact CBS settlement CODE
 * (covers ~all settlements, no name ambiguity), then a curated centroid for major
 * cities, then the CBS name index, then a loose contains match. Returns null if
 * nothing matches (the caller then omits the marker / shows "no map").
 */
export function geocodeCity(
  city: string,
  code?: string | number,
): { lat: number; lng: number } | null {
  if (code != null && String(code).trim()) {
    const byCode = CBS_BY_CODE[String(code).trim()];
    if (byCode) return { lat: byCode[0], lng: byCode[1] };
  }
  if (!city) return null;
  const key = normalizeName(city);
  let hit = NORMALIZED[key] || CBS_BY_NAME[normTight(city)];
  if (!hit) {
    if (!COLLAPSED_BY_NAME) {
      COLLAPSED_BY_NAME = Object.fromEntries(
        Object.entries(CBS_BY_NAME).map(([k, v]) => [k.replace(/יי/g, "י"), v]),
      );
    }
    hit = COLLAPSED_BY_NAME[collapseYod(city)];
  }
  if (!hit) {
    const found = Object.keys(NORMALIZED).find((k) => k.includes(key) || key.includes(k));
    if (found) hit = NORMALIZED[found];
  }
  if (!hit) return null;
  return { lat: hit[0], lng: hit[1] };
}
