import type { CostBreakdown } from "./types";

export interface CashflowMonth {
  month: number;
  land: number; // negative outflow
  costs: number; // negative outflow (construction + soft + statutory)
  revenue: number; // positive inflow
  net: number;
  cumulative: number;
}

export interface CashflowResult {
  months: CashflowMonth[];
  irr: number; // annualized
  peakEquity: number; // most negative cumulative (max capital at risk)
  profit: number;
}

/** Smoothstep cumulative fraction in [0,1] over [0,1] — an S-curve. */
function sCurve(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

export interface CashflowInputs {
  bid: number;
  revenue: number;
  costs: CostBreakdown;
  planningMonths: number;
  constructionMonths: number;
  salesDurationMonths: number;
  /** Fraction of revenue pre-sold at construction start; collected as staged
   *  buyer payments over the build window instead of the sales tail. */
  presalesFraction?: number;
}

/**
 * Build a monthly cashflow:
 *  - Land paid at t=0.
 *  - Statutory/soft + construction spent over the build period on an S-curve.
 *  - Sales revenue collected on an S-curve, starting mid-construction, released
 *    (under ליווי) toward the end. Net of financing which is already in costs.
 */
export function computeCashflow(input: CashflowInputs): CashflowResult {
  const { bid, revenue, costs } = input;
  const planning = Math.max(0, Math.round(input.planningMonths));
  const construction = Math.max(1, Math.round(input.constructionMonths));
  const sales = Math.max(1, Math.round(input.salesDurationMonths));

  const buildStart = planning;
  const buildEnd = planning + construction;
  // Sales typically begin once ~30% of construction is done and finish a bit after handover.
  const salesStart = planning + Math.round(construction * 0.3);
  const salesEnd = Math.max(salesStart + sales, buildEnd);
  const totalMonths = Math.max(buildEnd, salesEnd) + 1;

  const spendExLand = costs.totalExLand;
  const presold = Math.min(0.9, Math.max(0, input.presalesFraction ?? 0));
  const presoldRevenue = revenue * presold;
  const openRevenue = revenue - presoldRevenue;

  const months: CashflowMonth[] = [];
  let cumulative = 0;
  let peakEquity = 0;

  for (let m = 0; m < totalMonths; m++) {
    const land = m === 0 ? -bid : 0;

    // construction + statutory spend on S-curve over the build window
    const prevBuild = sCurve((m - buildStart) / construction);
    const curBuild = sCurve((m + 1 - buildStart) / construction);
    const spend = -(curBuild - prevBuild) * spendExLand;

    // presold units pay in stages over the build window (חוק המכר schedule);
    // open-market revenue arrives on the sales-window S-curve
    const presoldRev = (curBuild - prevBuild) * presoldRevenue;
    const prevSales = sCurve((m - salesStart) / (salesEnd - salesStart));
    const curSales = sCurve((m + 1 - salesStart) / (salesEnd - salesStart));
    const rev = presoldRev + (curSales - prevSales) * openRevenue;

    const net = land + spend + rev;
    cumulative += net;
    peakEquity = Math.min(peakEquity, cumulative);

    months.push({ month: m, land, costs: spend, revenue: rev, net, cumulative });
  }

  const flows = months.map((x) => x.net);
  const irr = annualizedIrr(flows);
  const profit = cumulative;

  return { months, irr, peakEquity: -peakEquity, profit };
}

/** Monthly IRR via bisection on NPV, annualized. Returns NaN if no sign change. */
export function annualizedIrr(monthlyFlows: number[]): number {
  const npv = (rate: number) =>
    monthlyFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let lo = -0.9;
  let hi = 1.0; // 100% monthly upper bound
  const nLo = npv(lo);
  const nHi = npv(hi);
  if (isNaN(nLo) || isNaN(nHi) || nLo * nHi > 0) {
    // No bracketed root — fall back to a simple annualized return on peak capital.
    return NaN;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const nMid = npv(mid);
    if (Math.abs(nMid) < 1) return Math.pow(1 + mid, 12) - 1;
    if (nLo * nMid < 0) hi = mid;
    else lo = mid;
  }
  const monthly = (lo + hi) / 2;
  return Math.pow(1 + monthly, 12) - 1;
}
