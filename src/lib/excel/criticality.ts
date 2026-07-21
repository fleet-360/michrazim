/**
 * Criticality classification for the custom-mode survey pipeline.
 *
 * The pipeline resolves conflicts by choosing a winner. When that choice — or a
 * material uncertainty — is left unmarked, the produced Excel looks certain
 * while hiding a decision that can cost real money (e.g. an indexation clause
 * where the special conditions override the general ones). This module decides
 * which resolved values are "critical" and therefore must be surfaced IN the
 * workbook itself (cell note + fill), scoped — per product decision — to items
 * that affect profitability / money / safety, so trivial low-confidence fields
 * don't create noise.
 *
 * Pure module (no server-only) so vitest can exercise it directly.
 */
import type { FieldSpec, FieldDomain } from "./serialize";

export type Criticality = "conflict" | "override" | "material_uncertainty";
type Confidence = "high" | "medium" | "low";

/** A non-winning candidate kept so an annotation can show both sides. */
export interface Alternative {
  value: string | number | null;
  sourceLabel: string;
  page?: number;
}

/** Money / profitability keywords — a hit makes the field "material". */
const MONEY_KEYWORDS = [
  "ערבות", "קנס", "פיצוי", "הצמד", "התייקר", "מקדמה", "עיכבון", "עכבון",
  "ביטוח", "מחיר", "תשלום", "מדד", "מע\"מ", "מע״מ", "סכום", "תמורה",
  "ריבית", "עלות", "שכר החוזה", "קיזוז", "אגרה", "היטל",
];
/** Safety keywords — a hit makes the field "material". */
const SAFETY_KEYWORDS = [
  "בטיחות", "מבצע הבנייה", "מבצע הבניה", "ממונה בטיחות", "סיכון",
  "מסוכן", "חירום", "כיבוי אש", "גילוי אש",
];

const MATERIAL_DOMAINS = new Set<FieldDomain>(["prices", "costs"]);

/**
 * A field is "material" when getting it wrong hits money/profitability/safety:
 * its domain is prices/costs, or its label/key names a money or safety concept.
 */
export function isMaterialField(spec: Pick<FieldSpec, "label" | "key" | "domain">): boolean {
  if (MATERIAL_DOMAINS.has(spec.domain)) return true;
  const hay = `${spec.label} ${spec.key}`.toLowerCase();
  return (
    MONEY_KEYWORDS.some((k) => hay.includes(k.toLowerCase())) ||
    SAFETY_KEYWORDS.some((k) => hay.includes(k.toLowerCase()))
  );
}

/** Values written by the locator pass — no real value, "read section X". */
export function isLocatorValue(value: string | number | null | undefined): boolean {
  return typeof value === "string" && /יש לקרוא|לקרוא סעיף|ראה סעיף/.test(value);
}

/** Two values "materially differ" — numbers by >0.1%, strings by normalized text. */
function valuesDiffer(a: string | number | null, b: string | number | null): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const na = typeof a === "number" ? a : Number(String(a).replace(/[,₪\s%]/g, ""));
  const nb = typeof b === "number" ? b : Number(String(b).replace(/[,₪\s%]/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    const max = Math.max(Math.abs(na), Math.abs(nb), 1);
    return Math.abs(na - nb) / max > 0.001;
  }
  const norm = (x: string | number) => String(x).replace(/\s+/g, " ").trim();
  return norm(a) !== norm(b);
}

export interface CriticalityInput {
  spec: Pick<FieldSpec, "label" | "key" | "domain">;
  value: string | number | null;
  /** Whether a real value was resolved (false = expected-but-unfilled). */
  hasValue: boolean;
  confidence?: Confidence;
  conflict?: boolean;
  alternatives?: Alternative[];
}

/**
 * Classify a resolved field. Returns null when it is NOT worth flagging.
 *
 * - `conflict` — reconcile already flagged sources as disagreeing (any field).
 * - `override` — a non-winning candidate materially disagrees with the chosen
 *   value even though conflict wasn't set (the silent "specific beats generic"
 *   pick — exactly the indexation case). Any field, since a hidden disagreement
 *   is the thing we must never do.
 * - `material_uncertainty` — ONLY for material fields: low confidence, a
 *   locator-only value, or a material field the format expects but nothing
 *   filled. Gated on materiality so common uncertainty doesn't create noise.
 */
export function classifyCriticality(input: CriticalityInput): Criticality | null {
  // An explicit conflict (reconcile already judged the sources to disagree)
  // surfaces for any field — that judgement isn't a heuristic.
  if (input.conflict) return "conflict";

  // The remaining signals are heuristics prone to false positives on free
  // text (two summaries of the same clause always differ a little), so they
  // fire ONLY on material fields — money / profitability / safety — per scope.
  if (!isMaterialField(input.spec)) return null;

  const alts = input.alternatives ?? [];
  if (alts.some((a) => valuesDiffer(input.value, a.value))) return "override";
  if (!input.hasValue) return "material_uncertainty";
  if (isLocatorValue(input.value)) return "material_uncertainty";
  if (input.confidence === "low") return "material_uncertainty";
  return null;
}

/** ARGB fill for a flagged value cell. Unfilled material gaps read as red. */
export function criticalityStyle(kind: Criticality, hasValue: boolean): { argb: string } {
  if (kind === "conflict" || kind === "override") return { argb: "FFFFE9A8" }; // amber
  return { argb: hasValue ? "FFFCE4D6" : "FFF8CBAD" }; // light orange / red
}

function fmtVal(v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "number" ? v.toLocaleString("he-IL") : String(v);
}

function withSource(label?: string, page?: number): string {
  return [label, page ? `ע׳${page}` : undefined].filter(Boolean).join(", ");
}

/** Build the Hebrew Excel cell note explaining why this cell is flagged. */
export function buildCriticalNote(input: {
  kind: Criticality;
  value: string | number | null;
  hasValue: boolean;
  winnerSource?: string;
  page?: number;
  alternatives?: Alternative[];
  conflictNote?: string;
}): string {
  const { kind, value, hasValue, winnerSource, page, alternatives = [], conflictNote } = input;

  if (kind === "conflict" || kind === "override") {
    const alt = alternatives.find((a) => valuesDiffer(value, a.value));
    const chosen = `נבחר: ${fmtVal(value)}${winnerSource ? ` (${withSource(winnerSource, page)})` : ""}`;
    const other = alt ? ` מקור אחר: ${fmtVal(alt.value)}${alt.sourceLabel ? ` (${withSource(alt.sourceLabel, alt.page)})` : ""}.` : "";
    const head = kind === "conflict" ? "⚠ סתירה בין מקורות." : "⚠ מקור ספציפי גובר על מקור כללי.";
    const extra = conflictNote ? ` ${conflictNote}` : "";
    return `${head} ${chosen}.${other} מומלץ לאמת מול המקור.${extra}`.slice(0, 500);
  }

  // material_uncertainty
  if (!hasValue) {
    return "⚠ שדה מהותי (כסף/בטיחות) שלא נמצא לו מקור — יש לבדוק ידנית מול מסמכי המכרז.".slice(0, 500);
  }
  if (isLocatorValue(value)) {
    return `⚠ פריט מהותי — לא חולץ ערך מלא; יש לקרוא את הסעיף במקור ולאמת. ${fmtVal(value)}`.slice(0, 500);
  }
  return `⚠ אי-ודאות מהותית (עלול להשפיע על תמחור/רווחיות) — הערך זוהה בביטחון נמוך. לאמת מול המקור${winnerSource ? `: ${withSource(winnerSource, page)}` : ""}.`.slice(0, 500);
}
