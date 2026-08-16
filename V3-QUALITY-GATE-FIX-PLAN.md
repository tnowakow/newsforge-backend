# NewsForge V3 — Quality Gate Fix Plan (SINGLE SOURCE OF TRUTH)

**Status:** #1 IN PROGRESS → then Tom tests → then #3
**Owner:** Bob
**Last updated:** 2026-08-16 (13:05 UTC)
**Trigger:** Tom's 2026-08-16 12:45 UTC test — real Porter template + his own photos for Trilogy Health Services (June 2026). Final score **29.5%** but the PDF still exported and shipped.

---

## 1. The Problem (what Tom saw)

1. **Page 2: birthday section exists even though the issue has zero birthdays** — and it's paired with "Happy Birthday!" headings.
2. **Page 2: two boxes cutting each other off** (clipped content).
3. **Page 3: photo-only page** (two photos, no text).
4. **Systemic: a 29.5% newsletter exported without any objection** — the pipeline always ships the least-bad candidate.

Evidence: `Why_This_Score---v3-spread-classic---f9375a24-…txt` (Tom's download) —
`clippedBlocks: 1`, `overflowBlocks: 2`, `underfilled-blocks: 8`,
"⚠ 8 boxes remain below the Porter-like 0.80 fill target",
"Signature birthday/rail anchor" rule **passed** (rewarding the fake section),
all measured candidates scored **0.0%** on the measured pass, yet final = 29.5% and PDF exported.

## 2. Root Causes (verified in the LIVE repo)

> All paths below are relative to the LIVE repo (see §5 Repo Map).

### RC-1 — Fake birthday section (3 stacked bugs)
- `apps/api/src/services/fullNewsletterWrapper.ts:227-229` — wrapper **unconditionally hardcodes** a `demo-cover-birthday` block with heading `"Happy Birthday!"` + filler copy.
- `apps/api/src/services/vibrancyPass.ts:181` — `block.heading = block.heading ?? "Happy Birthday!";` — forces the heading whenever a slot carries the "birthdays panel" style tag, regardless of content.
- The `v3-spread-classic` template carries a birthday slot that the planner **force-assigns** an article to even when the issue has zero birthday articles (this run: it shoved in the "Oaks at Jamestown 2nd anniversary" article).
- Aggravator: the scorer's birthday-anchor rule **passes** because a birthday rail exists → the fake section is actively rewarded.

### RC-2 — Boxes clipping each other
- `apps/api/src/services/layoutFitService.ts` fit pass: aggressively shrinks boxes (`rowSpan 4→2`) to close underfill/whitespace; "16 boxes reshaped to close underfill" → clipping (1 clipped + 2 overflow blocks in this run).

### RC-3 — Photo-only page
- Photo-band expansion candidate won the static pick; the measured pass (which would have caught it) returned 0.0% for every candidate (see RC-4), so the bad geometry stood.

### RC-4 — Measured candidate pass scores 0.0% (scorer bug)
- Every adaptive candidate scored `0.0%` after the measured pass in this run, while the full-output score was 29.5% and cover/inner scores were healthy (90.3% / 76.6%). The measured-path scoring is broken or mis-wired.

### RC-5 — No export floor (the meta-bug)
- `apps/api/src/routes/runs.ts` (create path ~line 1010, AI-arrange path ~line 1799): the final score is computed and persisted, but **nothing checks whether it is shippable**. `POST /:id/pdf` (`runs.ts:1624`) generates the PDF unconditionally.
- The only "gate" today is `fitReport.hardOverflowGate` (boolean, informational only) and a UI section labeled "Full-output quality gate" that merely *displays* numbers — it gates nothing.

## 3. Ordered Fix Plan

Order is deliberate: **floor first** (stop the bleeding, makes everything measurable), **Tom tests**, then content/layout fixes.

### #1 — Export floor (quality gate) — IN PROGRESS
**Goal:** a newsletter below the ship floor can never be exported silently. Floor default **60%** (env-tunable).

Implementation (live repo):
1. `packages/shared/schemas/layoutFit.ts` — new `QualityGateReportSchema` (`floor`, `finalScore`, `passed`, `reason`); add `qualityGate?` to `LayoutFitReportSchema`.
2. `apps/api/src/services/qualityGate.ts` (new) — pure `evaluateQualityGate(finalScore, floor?)` + `resolveQualityGateFloor(env)` reading `NEWSFORGE_QUALITY_GATE_FLOOR` (default 0.6, clamped 0–1, invalid → default).
3. `apps/api/src/services/layoutFitService.ts` → `buildLayoutFitReport()` (line 423): compute final score once (`fullOutput.fullOutputScore ?? pick candidate score ?? chosenScore`), use it for `score`, attach `qualityGate`. Covers BOTH call sites automatically (`runs.ts:1010` create, `runs.ts:1799` AI-arrange).
4. `apps/api/src/routes/runs.ts` → `POST /:id/pdf` (line 1624): if stored `layoutFitReport.qualityGate.passed === false` and request has no `force` (`body.force === true` or `?force=1|true`) → **409** `{ error: "quality_gate_blocked", qualityGate }`. Success response includes `qualityGate`.
5. `apps/web/src/lib/types.ts` — `QualityGateReport` interface + field on `LayoutFitReport`.
6. `apps/web/src/lib/api.ts` — `generatePdf(runId, variant, force?)` sends `{ force: true }` body when forced.
7. `apps/web/src/pages/Preview.tsx` —
   - `downloadPdf()`: gate failed → `window.confirm(...)` (codebase precedent: `Approved.tsx:104`) → force or abort.
   - "Why This Score" modal "Full-output quality gate" section: add ship-floor PASS/FAIL row.
   - `buildScoreDetailsText()`: add ship-floor line so the .txt download records the gate.
8. `apps/web/src/components/AutoArrangeBanner.tsx` — red "⚠ Ship floor: X% < Y%" chip (expanded + collapsed views).
9. Tests: `apps/api/src/__tests__/qualityGate.test.ts` (floor resolution, pass/fail boundaries, clamping, NaN).

**Done when:** API + web build clean; api tests green; a below-floor run shows the red chip, the modal FAIL row, and the PDF button requires explicit force; an above-floor run is unaffected.

### #3 — Conditional birthday slot (AFTER Tom tests #1)
1. Template/planner: birthday slot renders **only** when the issue contains ≥1 birthday article (type `birthday` or title/body match). No birthday → no slot, no assignment.
2. `vibrancyPass.ts:181`: remove the forced `"Happy Birthday!"` heading fallback (or make it conditional on real birthday content).
3. `fullNewsletterWrapper.ts:227-229`: make the hardcoded `demo-cover-birthday` block conditional on birthday content.
4. Scorer: birthday-anchor rule should be `not-applicable` when the issue has no birthdays (stop rewarding the fake section).
**Done when:** regenerate the Trilogy issue → no birthday section anywhere; score moves; gate row present.

### #2 — Fix measured candidate 0.0% pass
- Debug the measured-path scoring (all candidates 0.0% while full-output = 29.5%). Suspect: measurement not feeding subscores, or a zeroed multiplier. Add a unit test with known-good geometry.

### #4 — Cap fit-pass clipping
- Constrain rowSpan shrinking so no block is clipped to hit the 0.80 fill target; prefer underfill over clipping; make `hardOverflowGate` a real veto on selection.

### #5 — Rebalance photo weighting
- Photo-only page must not be a winning candidate; add a page-utility floor so pages with only images lose.

## 4. Test & Verification Procedure (per fix)

1. `cd dev-team/newsforge/newsforge-backend && npm run build` (all workspaces) — must be clean.
2. `cd apps/api && npm test` (node:test via tsx) — must be green.
3. Tom's regression: regenerate the **Trilogy Health Services / June 2026** issue in the workspace (same template + photos).
   - Compare the new "Why This Score" .txt against `Why_This_Score---v3-spread-classic---f9375a24-…txt`.
   - Check the red ship-floor chip, the PASS/FAIL row, and the force-export confirm.
   - Download the PDF before/after to compare page 2 & 3 visually.
4. Log the result in §6 Changelog.

## 5. Repo Map (⚠️ two checkouts exist — do not confuse)

| Path | What it is |
|---|---|
| `dev-team/newsforge/newsforge-backend/` | **LIVE.** Independent git checkout of `tnowakow/newsforge-backend`, synced with `origin/main`. **Railway deploys this. ALL EDITS HERE.** |
| `dev-team/projects/newsforge/` | **STALE working copy** inside the big workspace repo (`/home/tom/.openclaw/workspace` → `origin: tnowakow/newsforge-backend`). NOT a git repo of its own. Diagnostics from it must be re-verified before relying on them. |
| GitHub | `https://github.com/tnowakow/newsforge-backend` (`main`) |
| Production | `https://api-production-26a0.up.railway.app/` |

## 6. Decisions Log

- **2026-08-16** — Order: #1 → Tom tests → #3 → #2/#4/#5. (Tom: "one thing at a time".)
- **2026-08-16** — Floor = 60% default, env override `NEWSFORGE_QUALITY_GATE_FLOOR`. Chosen so the 29.5% run is blocked and the known-good 80.8% run (2026-08-12) passes with margin.
- **2026-08-16** — Gate is advisory-block on the **PDF endpoint**, not a new run status: force-export stays available (Tom must be able to compare bad output), but never silent.
- **2026-08-16** — Gate computed in `buildLayoutFitReport()` so create + AI-arrange paths are covered uniformly; no Prisma migration (lives in the JSONB `layoutFitReport`).
- **2026-08-16** — Confirmed LIVE repo = `dev-team/newsforge/newsforge-backend/`; plan doc lives inside it so it ships with the repo.

## 7. Changelog

- **2026-08-16 13:05 UTC** — Plan doc written (definitive). #1 implementation started in live repo.
