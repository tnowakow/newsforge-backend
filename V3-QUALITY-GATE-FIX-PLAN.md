# NewsForge V3 — Quality Gate Fix Plan (SINGLE SOURCE OF TRUTH)

**Status:** #1 COMPLETE & DEPLOYED → #3 birthday placeholder slice in progress
**Owner:** Bob
**Last updated:** 2026-08-25 (02:15 UTC)
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

### RC-1 — Fake birthday section / placeholder semantics (3 stacked bugs)
- `apps/api/src/services/fullNewsletterWrapper.ts:227-229` — wrapper **unconditionally hardcodes** a `demo-cover-birthday` block with heading `"Happy Birthday!"` + filler copy. Will clarified on 2026-08-24 that birthdays are supplied separately by the client, so this must be a client-fill placeholder only.
- `apps/api/src/services/vibrancyPass.ts:181` — `block.heading = block.heading ?? "Happy Birthday!";` — forces the heading whenever a slot carries the "birthdays panel" style tag, regardless of content. Empty birthday slots must become "Birthday List Placeholder" areas instead.
- The `v3-spread-classic` template carries a birthday slot that the planner **force-assigns** an article to even when the issue has zero birthday articles (this run: it shoved in the "Oaks at Jamestown 2nd anniversary" article).
- Aggravator: the scorer's birthday-anchor rule **passes** because a birthday rail exists → the fake section is actively rewarded. Placeholder-only birthday areas must be neutral/not-applicable, not rewarded as real content.

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

### #3 — Birthday placeholder slot (2026-08-24 Will clarification)
1. Template/planner: if no explicit birthday roster is present, preserve only a clearly marked client-fill birthday placeholder. Do **not** assign unrelated articles or generate resident/staff birthday names/dates.
2. `vibrancyPass.ts:181`: remove unconditional `"Happy Birthday!"` fallback for empty/client-fill birthday slots; use `"Birthday List Placeholder"` unless a real birthday roster article exists.
3. `fullNewsletterWrapper.ts:227-229`: convert the hardcoded cover birthday copy to a client-fill placeholder block.
4. Scorer/playbook: birthday-anchor rule should be `not-applicable` for placeholders and should never reward fake birthday content.
5. Reference material: save Tom's attached blank Porter template under `apps/api/src/reference/porter-examples/templates/blank-template.docx` and treat it as the canonical reminder that birthdays are externally supplied.
**Done when:** regenerate the Trilogy issue → no fake birthday names/copy anywhere; birthday area is visibly client-fill placeholder only; anniversary content stays in a general slot; scoring/playbook treats placeholder as neutral; gate row present.

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
- **2026-08-24** — Will clarified birthdays are not in the blank Porter template and are filled separately by Porter/client teams. Decision: NewsForge keeps a client-fill birthday placeholder but never fabricates birthday content.

## 7. Changelog

- **2026-08-16 13:05 UTC** — Plan doc written (definitive). #1 implementation started in live repo.
- **2026-08-16 15:30 UTC** — ✅ **#1 COMPLETE & DEPLOYED.** Commits `ecc2c0d` + `9b5b01e` pushed to `origin/main`. Changes: `QualityGateReportSchema` in shared (persisted on `layoutFitReport.qualityGate`), `apps/api/src/services/qualityGate.ts` (floor 0.6, `NEWSFORGE_QUALITY_GATE_FLOOR` env, 0–1 clamp), gate computed in `buildLayoutFitReport()` (covers create + AI-arrange), `POST /runs/:id/pdf` returns **409 `quality_gate_blocked`** with the gate report unless `force` (body `force: true` or `?force=1`) — pre-existing runs without a stored gate are evaluated on the fly from `fullOutputScore`/`score`. Web: types + `api.generatePdf(runId, variant, force)`, Preview 409 handling with **Force download** toast action, ship-floor row in Why-This-Score + TXT, banner chip (`ship floor ✓` / `below ship floor (29% < 60%)`). New tests `apps/api/src/__tests__/qualityGate.test.ts` (8 cases: env parsing, at/above/below floor, clamping). Validation: full workspace build clean (shared+api+web), API tests **119 pass / 1 skip / 0 fail**, production verified — live bundle `index-BAFps2BL.js` on `api-production-26a0.up.railway.app` contains `quality_gate_blocked`, `Force download`, `ship floor` strings. **Waiting on Tom's regression: open the Trilogy Health Services June 2026 run → Download PDF → expect blocked 409 + Force download; then proceed to #3 (birthday conditional).**
- **2026-08-25 02:15 UTC** — #3 re-scoped from "conditional birthday slot" to **birthday placeholder slot** based on Will's 2026-08-24 clarification. Implementation started: blank template saved under reference templates; wrapper/vibrancy/filler/scorer/playbook/prompt/mock-content rules updated so empty birthday slots are client-fill placeholders and not generated birthday content.
