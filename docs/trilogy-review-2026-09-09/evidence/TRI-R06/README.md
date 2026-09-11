# TRI-R06 — Typography asset audit and font contract

Scope: Trilogy inner pages 2 & 3. This card delivers: (1) an explicit audit of
approved faces vs. locally available assets, (2) a sanctioned substitute with
visually documented impact, and (3) the measured typography contract in
`packages/shared/renderContract.ts`. No embedded fonts were extracted from any
reference PDF.

## 1. Approved faces vs. local assets

| Approved face (reference) | Weight usage in Porter refs | Locally available? |
|---|---|---|
| Adobe Garamond Pro (AGaramondPro) | Regular 11.5pt (dominant body), Semibold 11.5pt, Bold 11.5–13pt, BoldItalic 21–25pt display, SemiboldItalic 11.5pt | **NOT available.** Commercial Adobe font; no licensed copy in system, user, or repo font dirs. No legal free download. |
| Museo Sans | 500 (11.5pt body), 700 (13pt), 900 (23–24pt kickers) | **NOT available.** Commercial Typewolf font; no licensed copy anywhere local. No legal free download. |

Source of reference metadata: `docs/trilogy-review-2026-09-09/evidence/typography-verified.json`
(pdffonts extraction across 18 Porter reference PDFs).

## 2. Sanctioned substitutes (explicit, not silent)

Per the card's sanctioned path, two OFL open-source faces substitute the
commercial originals. Files are in-repo (shipped in the Docker image) and
installed system-wide for the local Chromium renderer:

- **EB Garamond** (variable, Regular…Bold, OFL) → AGaramondPro (serif body)
  - in-repo: `packages/shared/fonts/EB-Garamond-Variable.ttf`
  - installed: `~/.local/share/fonts/newsforge/EBGaramond-Variable.ttf` (fc-list verified)
  - lineage: same Garamond revival family; covers Regular/Semibold/Bold/Italic usage
- **Source Sans 3** (variable, ExtraLight…Black, OFL) → Museo Sans (sans display)
  - in-repo: `packages/shared/fonts/Source-Sans-3-Variable.ttf`
  - installed: `~/.local/share/fonts/newsforge/SourceSans3-Variable.ttf` (fc-list verified)
  - covers the 500/700/900 weights used in the references

Missing asset = the two commercial faces above. They are declared in the
contract as `approvedFace` entries, NOT as loadable families. The loadable
(`required`) families are the two OFL substitutes.

### Visual impact of the substitution (this evidence dir)

Rendered with the sandboxed Chromium renderer. Because that renderer's
fontconfig is isolated from the host, the substitute files were loaded via
data-URI `@font-face` from the exact in-repo bytes — the same bytes the
production image ships. In the alpine production image the same families
resolve via the system fontconfig baked in by the Dockerfile.

- `A-substitute-contract.png` — contract stacks, substituted files, measured
  sizes: EB Garamond body (elegant old-style serif) + Source Sans 3 display
  (clean grotesque). Computed stacks resolve to the declared primary
  families; both fonts `loaded`.
- `B-generic-fallback.png` — what a renderer WITHOUT the fonts produces:
  declared generic fallbacks (serif/sans-serif).
- `C-freeserif-silent.png` — the silent-fallback defect class (FreeSerif /
  FreeSans): heavier, utilitarian, visibly inferior to case A. This is exactly
  the defect the strict availability gate in `pdf.ts` now throws on instead of
  shipping.

`font-resolution.json` records the computed font-family per role and the
loaded-font state for each case, machine-checkable.

## 3. The contract (measured, not uniform-scaled)

`packages/shared/renderContract.ts` → `LETTER_RENDER_CONTRACT` ("letter-inner-v1"):

- `fontAvailability.strict: true` + `required: ["EB Garamond", "Source Sans 3"]`
  — `pdf.ts` hard-checks both via the Font Loading API AND inspects the
  computed body font-family; a miss throws (no silent FreeSerif).
- Per-role measured values (from the reference spans, not a uniform scale):
  - display  — Source Sans 3, 900, **23pt**, lh 1.05  (MuseoSans-900 23–24pt kickers)
  - heading  — Source Sans 3, 700, **15pt**, lh 1.1   (13–18pt section heads)
  - body     — EB Garamond, 400, **11.5pt**, lh 1.38  (AGaramondPro-Regular 11.5pt, pitch ≈1.38)
  - list     — EB Garamond, 400, **11pt**, lh 1.3     (compact schedules)
  - caption  — EB Garamond, 400, **9pt**, lh 1.15     (ref captions ~8.5–9pt italic)
- Gutter 4px; margins 0.34/0.34/0.4in; 12-column grid; measure 44–66 chars.
- Verifiability: `contractRoleCss()` inlines all roles as CSS custom
  properties + rules into the rendered HTML, so the produced PDF carries the
  contract values (checked via pdffonts / CSS inspection). The
  `renderContract.test.ts` suite asserts the measured values and rejects a
  legacy 7.65pt body floor and any contract without explicit availability.

## 3. Layout-variant proofs (this card, t_996ab0ec)

Five reviewed layout variants, one per family, specified **without a birthday
roster and without a director headshot** (per the task). Each has source +
geometry metadata and a rendered proof:

| variant | anchor (measured) | family | modules |
|---|---|---|---|
| `sparse-editorial` | example-14 (2pp, 4 photos, 3121 chars) | editorial-light | 4–6 (not 12–18) |
| `medium-panel` | example-02 (1pp, 6 photos, 2455 chars) | community-collage | 8–12 |
| `dense-grid` | example-11 (2pp, 14 photos, 2238 chars) | dense-lavender-grid | 12–18 |
| `long-copy-feature` | example-18 (2pp, 5 photos, 5146 chars) | feature-band | 6–10 |
| `photo-heavy` | example-05 (1pp, 1 hero + 38 slices, 1730 chars) | photo-mosaic | 8–14 |

- Proofs: `variants/{name}.html` + `variants/{name}.png` (2448×1584 = 17×11in @144dpi),
  generated by `variants/gen_proofs.py`, rendered by `variants/render_pngs.mjs`
  (puppeteer-core, chromium-1217).
- Metadata: `{name}.metadata.json` (anchor, measured reference values from
  `scratch/tri-r06/table30.json`, module/photo/dated-row bands, module geometry,
  score note). Generated by `gen_variant_metadata.py`.
- Rules wired into code: `PORTER_GRAMMAR_TARGETS` (minModules 8, sparse band
  4–9, "band, not mandate" prompt text) in `apps/api/src/services/porterGrammar.ts`;
  "reference band" (not similarity-%) labels in `apps/web/src/pages/Preview.tsx`.

## 4. Verification

- `npm run typecheck` — pass (shared + api).
- `npm run build` — pass (shared, api, web).
- Task-relevant api suites (porterRetrieval, porterOneReferenceScorer,
  renderContract, porterLayoutInvariants, qualityGate) — 27/27 pass.
- Full api suite: 184/190 pass; the 5 failures (uploadService ×3,
  photoAssignment.r05, sourceManifest) reproduce identically on unmodified
  `main` (verified via git stash) — pre-existing, unrelated to this card.

- `node --test apps/api/src/__tests__/renderContract.test.ts` — 4/4 pass.
- `fc-list` — both families resolve on the host renderer.
- Visual A/B/C above + `font-resolution.json`.

Not done here (belongs to sibling cards): the art-directed two-page specimen
(t_7f4506b4) and the integrated tested SHA (t_d3fbe9a6).
