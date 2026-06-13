export type Origin = "live" | "mock";

export interface DataResult<T> {
  data: T;
  origin: Origin;
  source: string;
  note?: string;
}

/** fetch with an abort timeout; returns null on any failure (never throws). */
export async function safeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response | null> {
  const { timeoutMs = 6000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "User-Agent": "Radius/1.0 (real-estate underwriting)",
        Accept: "application/json",
        ...(rest.headers || {}),
      },
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function safeJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T | null> {
  const res = await safeFetch(url, init);
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
