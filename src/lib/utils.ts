import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as ₪ with Hebrew locale, compacting large values. */
export function formatILS(value: number, opts: { compact?: boolean; decimals?: number } = {}) {
  const { compact = false, decimals = 0 } = opts;
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Short ₪ formatting: 12.4M ₪ / 840K ₪. */
export function formatShekelShort(value: number) {
  if (!isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} מיליארד ₪`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} מ׳ ₪`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}K ₪`;
  return `${sign}${Math.round(abs)} ₪`;
}

export function formatPct(value: number, decimals = 1) {
  if (!isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 0) {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: decimals }).format(value);
}
