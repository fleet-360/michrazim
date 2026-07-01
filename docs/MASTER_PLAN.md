# Radius (רדיוס) — Production Master Plan

**Deep-dive analysis, 2026-07.** Four parallel audits were run across the codebase: underwriting engine + data adapters, server/security, frontend/UX, and ops/deployment. This document is the synthesized, prioritized master plan. Every claim is grounded in a `file:line` reference.

**Verdict in one paragraph:** Radius is a genuinely strong product core — the closed-form RLV solution to the land-carry circularity (`src/lib/engine/financing.ts:31-48`), the fallback chains on every gov-data adapter, and the RTL implementation are all top-tier. But it is **not production-safe today**: there are confirmed IDOR vulnerabilities letting any authenticated user delete or mutate any other user's projects and shared city data, a hardcoded fallback JWT secret, zero rate limiting on paid AI calls, no CI, and no observability. Separately, the Monte Carlo engine's statistically independent sampling systematically **understates risk** — the one thing the product promises to measure. Fix Part 0 before any public deploy; Part C makes the math honest; Parts A/B make it a product people evangelize.

---

## Part 0 — Production Blockers (fix before anything else)

These are not "upgrades"; they are prerequisites for having users at all.

### 0.1 Authorization (IDOR) — CRITICAL
| Vulnerability | Location | Fix |
|---|---|---|
| Any user can **delete any project** | `src/server/actions.ts:275` — `Project.findByIdAndDelete(id)` with no ownership check | `findOneAndDelete({ _id: id, createdBy: session.id })` |
| Any user can **rewrite any project's bid/risk** | `src/server/actions.ts:111` — `findByIdAndUpdate` with no check | `findOneAndUpdate({ _id: id, createdBy: session.id }, ...)` |
| Any user can **mutate shared city fee schedules** (poisons every other user's underwriting) | `src/server/actions.ts:222` | Gate behind an `admin` role, or fork fee schedules per-org (see 0.4) |
| Any user can **delete comparables / wipe a city's comps** | `src/server/actions.ts:198`, `:205` | Same — role-gate or per-org scope |

The city-fees hole is the sneakiest: fee schedules feed directly into every user's cost model, so one malicious/careless user silently corrupts everyone's Go/No-Go verdicts.

### 0.2 Auth hardening
- **Kill the fallback secret** at `src/server/auth.ts:10` (`"dev_fallback_secret_change_me_please_0123456789"`). Anyone who reads the repo can forge a session for any user. Fail hard at startup in production if `AUTH_SECRET` is unset.
- Demo password committed in plaintext at `src/server/seed-data.ts:448-456` — acceptable for dev seed, but rotate it and never reuse the pattern.
- Cookie flags are correct (`httpOnly`, `sameSite=lax`, `secure` in prod — `auth.ts:47-53`). Add a logout/session-invalidation path.

### 0.3 Input validation — zod is installed and never used
`zod@4` is in `package.json` but zero server actions validate input. Every action takes raw strings/objects into Mongoose and into AI prompts. Add a zod schema per action (30+ actions in `src/server/actions.ts`). Also constrain `/api/parcel` (`src/app/api/parcel/route.ts`) to `^\d{1,6}$` for gush/helka.

### 0.4 AI cost abuse — no rate limiting anywhere
Every authenticated user can spam `askProjectQuestion` / `parseDealsText` (up to 3,000 output tokens per call, `src/lib/ai/insights.ts`) in an infinite loop. Add per-user quotas (e.g. token bucket in Mongo or Upstash: 30 AI calls/hour, 300/day) and a daily org-level circuit breaker. Also: prompt-injection surface — user text is interpolated raw into prompts (`insights.ts:89`, `:158-216`). Wrap user content in delimited data blocks and instruct the model to treat it as data only.

### 0.5 Database & deploy basics
- **Missing indexes** that will hurt at ~1k users: `Project.createdBy` (queried at `src/server/queries.ts:107`) and `Comparable.city` (`queries.ts:125`) — add `index: true` in `src/server/models.ts`.
- **`MONGODB_URI` defaults to localhost** (`src/server/db.ts:8`) — provision MongoDB Atlas; the Mongoose global-cache connection pattern is already serverless-ready.
- **No `.env.example`** — create one documenting `AUTH_SECRET`, `MONGODB_URI`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_*`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **No CI** — add a GitHub Actions workflow: `lint` → `typecheck` → `vitest` → `next build`. The e2e suite (4 Playwright smoke tests) can run against a service container later.
- **No observability** — Sentry (or equivalent) + structured logging (pino) + a `/api/health` endpoint (the building blocks already exist in `src/server/status.ts`).

**Effort estimate for all of Part 0: ~3-5 focused days.** Nothing here is architecturally hard; it's discipline work.

---

## Part A — Immediate UX & Behavioral Wins

The audit mapped the full journey (login → tenders → wizard → workspace → report). Friction ranking, highest first:

### A.1 Put the bid slider where the money is
The bid/risk sliders — the emotional core of the product — are buried inside a tab (`src/components/project/project-workspace.tsx:110-150`). The user's central question is *"how much do I bid?"*; the answer should never be one click away. Pin a persistent **bid command bar** (slider + recommended bid + P(loss) + verdict chip) above the tabs, always visible. The tabs then become *evidence* for the number, not the container of it.

### A.2 First-run experience is a dead aquarium
A new user sees 4 KPI stat cards computed over zero projects (`src/app/(app)/dashboard/page.tsx:87-115`). Replace the zero-state dashboard with a single guided action: *"Pick a live tender → we'll underwrite it in 60 seconds."* The tender→project import already exists (`tender-import-button.tsx`) — the onboarding is just routing the user through the happiest path that already works. Add a one-time hint for the command palette (Cmd+K is currently undiscoverable).

### A.3 Kill the ghost input
`presalesRequirement` is collected in the wizard but **never used** by the engine (`src/lib/templates.ts:64`). Every ignored input erodes trust in a numbers product. Either wire it into the cashflow model (presold units accelerate cash, reduce carry) or delete the field. Same principle: surface the `TENANT_BETTERMENT = 1.15` assumption (`src/lib/engine/rlv.ts:17`) and `AVG_DRAW_FACTOR = 0.5` (`financing.ts:20`) as visible, editable assumptions — pros will distrust a black box, and these two constants materially move the answer.

### A.4 Label the data honestly, everywhere
The adapters already track `source: "live" | "mock"` and `origin: "live" | "synth"` (`src/lib/data/rmi.ts`, `govmap.ts:168-176`) but there's no "data as of" timestamp anywhere, and the hardcoded national-average fee schedule (`src/server/analysis.ts:4-11`) falls back **silently**. A professional underwriter must know which numbers are measured vs. assumed. Add a data-provenance strip to the workspace and report: each cost line gets a badge — 🟢 live source / 🟡 city table / 🔴 national default — with timestamps. This is cheap and it's the difference between "toy" and "tool" in a buyer's eyes.

### A.5 Report as iteration surface, not dead end
The report (`src/app/(app)/projects/[id]/report/page.tsx`) is read-only; changing the bid means navigating back. Add the bid slider to the report header (re-running at 5,000 runs on release). The report is what gets shown to partners — it should be the live artifact.

### A.6 Quick wins bundle (one day, total)
- Lazy-load recharts — 6 chart components load eagerly (`project-workspace.tsx:20-25`, ~150KB) while maps and xlsx are already correctly dynamic. Wrap charts in `dynamic()` per tab.
- Error boundary around the workspace (heavy client-side compute, currently uncaught).
- Focus traps in dialogs; `role="img"` + aria labels on charts (only 19 ARIA attributes across 60 components).
- Empty state for filtered-to-zero watchlist.

---

## Part B — Creative / "Killer" Features

Ranked by (engagement moat × feasibility). The theme: **Radius currently answers "what is this land worth to me?" The killer versions answer "will I win, and was I right?"** — the two questions no spreadsheet can answer.

### B.1 The Win Curve — bid vs. probability-of-winning frontier ⭐ flagship
Today the bid gauge shows floor / recommended / winner's-curse threshold — all derived from *your own* economics. The missing half of the winner's curse is **the other bidders**. RMI publishes tender *results* (winning bids, and often all bids). Ingest historical results per region/segment, fit an empirical distribution of competitor bids per land value, and render the curve every developer actually wants:

> **P(win at bid X) × profit-if-won at X = expected value curve** — with the optimum marked.

This transforms the product from a calculator into a *bidding strategy engine*. Nobody in the Israeli market offers this. The Monte Carlo plumbing (`montecarlo.ts`) already exists; this adds one more sampled variable (highest rival bid) and one results-ingestion adapter. It's also self-reinforcing: every published tender result makes the model better — a data moat.

### B.2 The Calibration Loop — "was the model right?"
When a tender the user analyzed gets decided, auto-compare: *your modeled land value vs. the actual winning bid*. Show a personal calibration report: "Across 14 tenders you analyzed, your price assumptions ran 9% optimistic; your cost assumptions were well-calibrated." This is the retention engine — the product gets measurably smarter about *you* over time, and switching away means abandoning your calibration history. No competitor can copy accumulated feedback.

### B.3 Radar — auto-underwriting alerts (the reason to come back)
The pieces all exist: live tender feed (`rmi.ts`), watchlist (`watch-button.tsx`), one-click tender→project import, and a fast engine (~150ms for 5k runs). Connect them with a background job: user defines an investment profile (regions, size range, hurdle margin) → every new matching tender is **automatically underwritten overnight** → morning digest email/push: *"3 new tenders match. One clears your 18% hurdle at the minimum price — modeled upside ₪4.2M."* This flips the product from pull to push, and push is where daily-active engagement lives.

### B.4 Opportunity Heatmap — the "Zestimate for tenders" screener
Run the quick-estimate engine over **all** open tenders (the tender detail page already computes headline estimates, `tenders/[id]/page.tsx:33-63`) and rank by *modeled residual value ÷ minimum price*. The map page stops being a directory and becomes a **screener**: "show me mispriced land." This is the screenshot that markets the product on its own.

### B.5 Deal Room — shareable read-only memo (the viral loop)
Developers raise equity and bank financing (ליווי) for every deal. Add tokenized read-only share links to the report — live charts, provenance badges, "powered by Radius" footer. Every fundraise puts the product in front of 5-10 investors and a bank credit officer: the exact buyer persona. Distribution built into the workflow. (Requires Part 0 auth work first, obviously.)

### B.6 The AI Investment Committee
Upgrade the single AI analyst into a structured **ועדת השקעות**: three personas argue the deal — a שמאי challenging price/m² against comps, a bank credit officer stress-testing the financing and presale assumptions, and a skeptical partner hunting deal-killers. Output: a dissent-style memo with each persona's strongest objection and what evidence would change their mind (the break-even engine at `src/lib/engine/breakeven.ts` already computes flip-points — surface them as *"the deal dies if prices drop 7%"*). Far more memorable than a generic risk paragraph, and it maps to how these decisions are actually made.

### B.7 Honorable mentions (cheap, do opportunistically)
- **Assumption templates** — "save my assumptions as a firm template" for the wizard (developers reuse the same cost stack).
- **Excel round-trip** — import an existing underwriting spreadsheet, not just export (xlsx lib already shipped).
- **District/price/size faceted filters** on the tenders explorer (`tenders-explorer.tsx:14-20` currently has categories only).

---

## Part C — Hardcore Architecture & Performance Upgrades

### C.1 Make the math honest: correlated Monte Carlo — CRITICAL for credibility
`montecarlo.ts:67-75` samples every uncertain variable **independently**. In reality sale prices and construction costs co-move (inflation), and timeline slippage drives carry costs. Independent sampling *narrows* the outcome distribution → **systematically understates P(loss)** — the flagship metric. Fix: sample via a **Gaussian copula** (draw correlated standard normals with a Cholesky-factored correlation matrix, then map through each marginal's inverse CDF — Acklam's approximation is already implemented in `distributions.ts`). Default correlations (price↔cost ≈ +0.5, timeline↔carry ≈ +0.7, price↔absorption ≈ −0.4) as a visible, overridable assumption. ~1-2 days of work; it changes the headline numbers and makes them defensible in front of a שמאי.

### C.2 Israeli fiscal completeness (ranked by materiality)
1. **Indexation (הצמדה למדד)** — completely absent; on 30-47 month projects nominal modeling materially understates carry. Add a CPI-path assumption (can itself be a distribution).
2. **מע"מ** — no VAT logic anywhere; מחיר למשתכן exemptions vs. standard sales change revenue by double digits.
3. **מס רכישה** — modeled as flat linear (`financing.ts:173`); implement the stepped brackets + urban-renewal exemptions.
4. **היטל השבחה** — currently a broad triangular guess (₪1-5M band, `templates.ts:53-55`); at minimum let users attach an assessment; longer-term derive from the plans dataset already being ingested.
5. **Floating-rate financing** — fixed 6.3% today; model prime-linked spread with a rate path.

### C.3 Move data adapters server-side + real cache
Gov-API calls currently run client-side with brutal timeouts (GovMap WFS: 16s, `govmap.ts:125`; CKAN: 12s) and in-memory caches that die with the process — and nadlan has **no cache at all** (`nadlan.ts`). Restructure: all adapters behind server routes/actions, cached in a shared store (Upstash Redis or a Mongo cache collection) with stale-while-revalidate — tender lists refresh on a schedule (cron), not per request. First-paint on tenders goes from "up to 12s on cold cache" to instant, and it centralizes rate-limit handling for B.3's background jobs.

### C.4 Engine execution model
Client-side Monte Carlo is a *good* decision (instant slider feedback, zero server cost) — keep it, but move it into a **Web Worker** with a transferable results buffer: 2,600-run re-runs currently block the main thread during slider drags (`project-workspace.tsx:135`), which is why the 110ms debounce exists. Worker + progressive refinement (500 runs while dragging → 5,000 on release) makes the slider feel liquid. Dashboard-side, `analyzeProject` re-runs 1,500 iterations per project card per page load (`dashboard/page.tsx:40-67`) — persist an analysis snapshot on the project document, recompute only on input change.

### C.5 Multi-tenancy done properly
The `User.orgId` field exists (`models.ts:21`) but `Project` has no org scope and comparables/city-fees are global mutable state. Target model: **org-scoped projects** (partners see each other's deals — this is how development firms actually work), **org-scoped fee/assumption overrides** layered over a read-only global baseline, and an RBAC enum (`admin | analyst | viewer`) enforced in a single `authorize()` helper that every server action calls. This also unblocks B.5's share links (a `viewer` grant with token).

### C.6 AI layer hardening
- **Stream** report/analysis responses (currently fully buffered — a 2,000-token Opus memo is a long blank skeleton).
- Cache AI outputs keyed on input hash — identical analyses shouldn't re-bill.
- Per-user/org token budgets (see 0.4) with usage surfaced in the UI.
- Structured-output (tool-use/JSON schema) for `parseDealsText`/`parseTenderText` instead of free-text parsing — removes a whole class of silent extraction bugs.

### C.7 Testing strategy — invert the pyramid gap
The engine is well-tested (12+ focused Vitest specs) but **all 30+ server actions, auth, and every AI path have zero tests**. Priorities: (1) integration tests for actions with `mongodb-memory-server` (already a dev dep) asserting the *ownership checks from Part 0* — codify the security fixes so they can't regress; (2) property-based tests for the copula sampler (marginals preserved, correlation ≈ target); (3) golden-file test for a full underwriting (fixed seed → exact expected report numbers) so any engine change that moves the answer is a deliberate, reviewed event; (4) untested engine corners: IRR bisection non-convergence (`cashflow.ts:89-110` returns silent NaN), tornado swing correctness, bid-recommendation interpolation.

### C.8 Deployment target
Vercel + MongoDB Atlas + Upstash fits perfectly at this scale: Monte Carlo is client-side, server work is I/O-bound, the Mongoose connection cache is serverless-ready. Add: cron (Vercel Cron or Inngest) for the tender-refresh + Radar jobs, Sentry, and the CI gate from Part 0. No Kubernetes, no microservices — this is a modular monolith and should stay one until the data-ingestion side demands a separate worker.

---

## Sequencing

| Phase | Contents | Outcome |
|---|---|---|
| **Week 1** | Part 0 entire (IDOR, secret, zod, rate limits, indexes, Atlas, CI, Sentry, `.env.example`) | Safe to put real users on |
| **Weeks 2-3** | C.1 copula + C.2.1-2 (indexation, VAT) + A.3/A.4 (ghost input, provenance badges) + A.1 (bid command bar) + A.6 quick wins | The numbers are defensible and the core loop feels premium |
| **Weeks 4-6** | C.3 server-side adapters + cache, C.4 worker, A.2 onboarding, C.7 test debt | Fast, resilient, regression-proof |
| **Quarter** | B.1 Win Curve → B.3 Radar → B.2 Calibration → B.5 Deal Room (with C.5 org model underneath) | Moat: bidding strategy + accumulating personal data + built-in distribution |

The strategic through-line: **Part 0 earns the right to have users, Part C earns their trust, Part B earns their obsession.**
