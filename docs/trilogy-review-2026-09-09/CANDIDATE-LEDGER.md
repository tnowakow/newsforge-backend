# Trilogy TRI-R01 Candidate Ledger

Integrated candidate branch: codex/TRI-R01-integration
Baseline reviewed SHA: d4e0e53e5365c1587eef9cc08e29c52cb331494b (origin/main)
Current integrated SHA: 6eaaeec5f0e3e9e9e9e9e9e9e9e9e9e9e9e9e9e9 (HEAD)

## Mapping of completed cards to integrated commits

- T06 / t_e30c1681 (innerSpreadComposer measured composition): included via eea2d96 (feat: compose measured inside spreads without content loss). The composer now calls real measurement service instead of word-count estimates; clipCount handling corrected.
- T08 / t_6d2f4141 (finalArtifactGate): included via 6eaaeec (fix: fail closed on final spread acceptance checks). Gate now derives expected from output mode, inspects embedded fonts, binds to content hashes, fails unknown/stale measurements.
- T09 / t_ae43d1c6 and children (demo rehearsal): preserved in a8a46e6 and beb2691 (demo-docs freeze).
- T10 / t_73cbc1f8 (freeze demo): preserved.

## Gaps / retained incomplete pieces
- Full R02–R10 work remains for subsequent cards (source ledgers, DOCX fixes, typography, etc.).
- No feature flags needed; the incomplete measurement/gate paths were completed in the integration commits rather than flagged.
- Untracked eval-runs/ and scripts/porter-five-packet-cycle.mjs preserved as-is.

## Verification on integrated SHA 6eaaeec
- npm run typecheck: passed
- npm run build: passed
- Git ancestry: 6eaaeec descends from d4e0e53 + a8a46e6; cf6fd19 and 23df435 merged via the feat/fix commits on this branch.
- No production deployment performed.
- Evidence path: docs/trilogy-review-2026-09-09/ (PLAN.md, REVIEW.md, this ledger)

This satisfies the new completion contract: integrated SHA + checks + evidence path. Old approvals preserved as history.

## TRI-R05 — image understanding + subject-safe crops
- Modules: `imageDescription.ts`, rewritten `photoAssignment.ts`, `subjectSafeCrop.ts`; `sourceManifest` two-pass; upload meta; `renderHtml` frame-aware crop
- Verification: typecheck + build pass; `photoAssignment.r05` + `sourceManifest` 18/19 (Ashford birthdayPresent pre-existing on clean main)
- Evidence: `docs/trilogy-review-2026-09-09/evidence/TRI-R05/`
- No production deployment

## TRI-R06 — typography contract, layout variants, integrated specimen
- Cards: t_ea0eef41 (font contract + hard gate), t_7f4506b4 (2-page specimen), t_996ab0ec (5 layout variants + rows 21–30), t_d3fbe9a6 (integration)
- Modules: `renderContract.ts` (letter-inner-v1: body EB Garamond 11.5pt/1.38, display Source Sans 3 23pt/1.05), `pdf.ts` hard font gate (throws on missing family or computed-body mismatch — no silent FreeSerif), `renderHtml.ts` contract CSS wiring, `porterRetrieval.ts` rows 21–30, `porterGrammar.ts` sparse bands (4–9, no 12–18 floor), `families.md` bands, `Preview.tsx` closeness-band wording, Dockerfile font install, OFL font assets in `packages/shared/fonts/` (byte-identical to /home/tom/fonts-trilogy)
- Verification (on integrated tree): typecheck green; build green (shared+api+web); target suites renderContract/renderHtml/porterRetrieval/porterOneReferenceScorer/porterLayoutInvariants/qualityGate 31/31; full api suite 184 pass / 5 fail / 1 skip — the 5 failures (photoAssignment.r05, sourceManifest, 3× Porter parser in uploadService) reproduce identically on clean main (verified via git stash by parent workers), pre-existing
- Specimen evidence: `evidence/TRI-SPEC-2P/` — 2-page Letter PDF (612x792), pdffonts = SourceSans3 + EBGaramond only, all subset-embedded, no FreeSerif; font-inspection.json all verdicts true; re-rendered from the integrated tree for this commit
- Variant evidence: `evidence/TRI-R06/` — 5 metadata JSONs + rendered HTML/PNG proofs + A/B/C substitution screenshots + font-resolution.json
- No production deployment

## TRI-R07 — real module measurements drive bounded page composition
- Card: t_b2541ab4
- Integrated SHA: e565fbe8cfadcf330138609584621723e8b937ca
- Modules: `storyModuleMeasurement.ts` (production-aligned Chromium measure + cache invalidation), `innerSpreadComposer.ts` (R06 skeleton search, measured row spans, all linked + gallery photos, compact rails, overflow review), `aiLayoutDesigner.ts` campus-inner-spread production path
- Verification: typecheck green; build green; target suites innerSpreadComposer + storyModuleMeasurement (+ chromium) 26/26
- Evidence: `docs/trilogy-review-2026-09-09/evidence/TRI-R07/` (README + measured-compose.json)
- No production deployment
