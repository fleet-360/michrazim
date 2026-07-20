/**
 * Smart Enrichment Layer — shared types.
 *
 * Two stages: a PLANNER decides what real external data would fill the empty/weak
 * fields for THIS parcel, and an EXECUTOR actually fetches it (including a web-
 * navigation agent for comparable deals). The whole layer is mode-agnostic — it is
 * consumed identically by full, partial, and custom (Excel) modes.
 *
 * House rule: this layer NEVER emits a computed anchor / median / estimate. Every
 * output is a `FactCard` — a single real datum backed by a `sourceUrl` + verbatim
 * `quote`. "The AI advises, real data rules."
 */

import type { PlanInfo } from "@/lib/data/iplan";

/** What we know about the parcel — the planner's context. */
export interface ParcelIdentity {
  city?: string;
  neighborhood?: string;
  /** Free-form site / מתחם / address text. */
  site?: string;
  gush?: string;
  helka?: string;
  planNumber?: string;
  lat?: number;
  lng?: number;
  assetType?: "residential" | "single_family" | "commercial" | "mixed";
}

export type EnrichSourceKind =
  | "nadlan"
  | "madlan"
  | "komo"
  | "govmap"
  | "yad2"
  | "iplan"
  | "rmi"
  | "web";

export type FetchMethod = "web_agent" | "structured";

export type FetchIntent =
  | "comparable_deals"
  | "live_plan"
  | "rmi_record"
  | "parcel_area"
  | "context";

export type Priority = "critical" | "high" | "medium";
export type Confidence = "high" | "medium" | "low";

export interface WeakField {
  key: string;
  label: string;
  domain?: string;
}

export interface FetchTask {
  id: string;
  intent: FetchIntent;
  method: FetchMethod;
  source: EnrichSourceKind;
  /** Hebrew rationale — why THIS parcel needs this (audit + UI). */
  reason: string;
  /** Which weak-field keys this task would help fill. */
  targets: string[];
  /** Concrete Hebrew query hint for the web agent, e.g. "עסקאות צמודי קרקע רקפות באר שבע 2024". */
  query?: string;
  priority: Priority;
}

export interface FetchPlan {
  tasks: FetchTask[];
  note?: string;
}

/** Structured comparable deal — shares ParsedDeal's shape (insights.ts). */
export interface DealFact {
  address?: string;
  neighborhood?: string;
  city?: string;
  gush?: string;
  helka?: string;
  dealDate?: string;
  totalPrice?: number;
  sizeSqm?: number;
  pricePerSqm?: number;
  rooms?: number;
  floor?: number;
  yearBuilt?: number;
  assetType?: string;
  /**
   * Whether the price is a registered CLOSED transaction (עסקה שבוצעה) or an
   * ASKING price from a live listing (מחיר מבוקש). Asking prices run systematically
   * higher than closed prices, so underwriting must not treat them interchangeably.
   * Defaults to "closed" only when the source is a known deal registry.
   */
  priceBasis?: "closed" | "asking";
}

/** A single fact — NEVER a computed anchor. Always source-backed for web facts. */
export interface FactCard {
  taskId: string;
  kind: "deal" | "plan" | "rmi" | "parcel" | "context";
  source: EnrichSourceKind;
  /** Required for web_agent facts (host must be in the allowlist). */
  sourceUrl?: string;
  /** Verbatim snippet from the fetched page — required for web_agent facts. */
  quote?: string;
  fetchedAt: string;
  confidence: Confidence;
  /** present when kind === "deal" */
  deal?: DealFact;
  /** present when kind === "plan" */
  plan?: Partial<PlanInfo>;
  /** Custom-mode: mapping onto the user's Excel field keys. */
  fields?: { key: string; value: string | number }[];
  /** Human label for structured (non-deal) facts. */
  label?: string;
}

export interface EnrichmentBudget {
  maxTasks?: number;
  maxAgentTurns?: number;
  deadlineMs?: number;
}

export interface ProgressEvent {
  phase: "planning" | "fetching" | "done";
  msg: string;
}

export interface EnrichmentResult {
  plan: FetchPlan;
  facts: FactCard[];
  warnings: string[];
  stats: {
    tasksPlanned: number;
    tasksSucceeded: number;
    deals: number;
    plans: number;
  };
}
