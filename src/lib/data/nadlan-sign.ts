import { gunzipSync } from "zlib";

/**
 * Decoder for nadlan.gov.il's `api.nadlan.gov.il/deal-data` responses. The nadlan
 * SPA was rebuilt: the old `Nadlan.REST` JSON API is gone. Deals now come from a
 * POST whose populated response body is `base64(gzip(JSON))` →
 * `{ statusCode, data: { total_rows, items } }` (empty / rate-limited responses
 * arrive as plain JSON). We intercept that response from a real browser session
 * (see nadlan-browser.ts) and decode it here.
 *
 * NOTE for future work — the request itself is a signed envelope the browser mints:
 * body `{"##": <reversed HS256 JWT>}` sent as text/plain, JWT payload
 * `{base_id, base_name, fetch_number, type_order, exp, domain}`, HS256 secret from
 * the public bundle, base_name ∈ {settlmentID, streetCode, neighborhoodId,
 * addressId, kParcelName}. Signing alone is NOT enough: the endpoint also requires
 * a reCAPTCHA-Enterprise token, which only a genuine browser can produce — hence
 * the browser-driven approach rather than a pure server fetch.
 */

export interface DealResponseDecoded {
  statusCode?: number;
  data?: { total_rows?: number; items?: Record<string, unknown>[] };
}

/**
 * Decode a deal-data response body. Populated responses are base64(gzip(JSON));
 * empty / limited ones are plain JSON. Tries compressed first, then plain. Never throws.
 */
export function decodeDealResponse(text: string): DealResponseDecoded | null {
  if (!text) return null;
  try {
    const buf = gunzipSync(Buffer.from(text, "base64"));
    const obj = JSON.parse(buf.toString("utf8")) as unknown;
    if (obj && typeof obj === "object") return obj as DealResponseDecoded;
  } catch {
    /* not base64-gzip — fall through to plain JSON */
  }
  try {
    const obj = JSON.parse(text) as unknown;
    if (obj && typeof obj === "object") return obj as DealResponseDecoded;
  } catch {
    /* not JSON either */
  }
  return null;
}
