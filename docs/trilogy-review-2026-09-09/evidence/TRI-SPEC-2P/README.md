# TRI-SPEC-2P — Art-directed two-page specimen (pages 2–3)

Manual art-directed specimen of the Trilogy July 2026 campus newsletter inner
pages, built from the primary DOCX + all seven test photos. Purpose: give
Tom/Will a concrete appearance target to select from, and prove the achievable
design before render automation is optimized (per t_461a2619 work item 3).

## Deliverables

- `specimen.pdf` — 2 pages, US Letter (612x792pt), sha256
  `af571f21b33e06bbf28b548eac52262673357dfacb4b4b865360b54456444d18` (re-rendered 2026-09-11 from the integrated tree)
- `specimen.html` — the art-directed source (all content, layout, captions)
- `page-1.png`, `page-2.png` — rendered page proofs (2x)
- `render.mjs` — Puppeteer render + inspection harness (mirrors the production
  pdf.ts contract checks)
- `photos/` — copies of the 7 test photos used (photo1–photo7)

## Sources

- DOCX: "July Campus Newsletter Content.docx" (from
  /home/tom/.hermes/plans/newsforge-demo-2026-09-10/inputs/wills-original/),
  sha256 b122851d8d34199187320b9e84323c2858b185e78788f28522305335272a0889
- Photos: photo1.jpg … photo7.jpg (same directory)

## Content decisions (acceptance: no birthday roster, no director headshots)

- Birthday roster: NOT in the DOCX and NOT in the specimen (excluded).
- Director headshots: none used. ED Corner is text-only, signed
  "Yours in service — Elise Van De Steenoven, Executive Director" (name from
  the DOCX, per source — no photo of the director).
- All DOCX content sections present across the two pages:
  ED Corner, Legacy News, Upcoming Campus Events (compact two-column schedule),
  The Oaks at Jamestown, Chef Circle, Campus in Color, Around Campus, closing
  line.

## Typography (per the TRI-R06 contract, packages/shared/renderContract.ts)

- Body: EB Garamond (OFL substitute for Adobe Garamond Pro), 11.5pt/1.38
- Headings/display: Source Sans 3 (OFL substitute for Museo Sans),
  23pt display / 15pt section headings
- 12-column grid, 4px gutter; short headings + lighter prose per acceptance.

## Font inspection (acceptance: embedded fonts match the contract)

`render.mjs` checks via the Font Loading API + computed body font-family
(same hard-gate as production pdf.ts). Result: required EB Garamond=true,
Source Sans 3=true; computed body "EB Garamond", "Adobe Garamond Pro", serif;
computed heading "Source Sans 3", "Museo Sans", sans-serif.

`pdffonts specimen.pdf`: ONLY SourceSans3-Roman and EBGaramond-Regular, all
subset-embedded (Type 3 outlines are Chromium's standard embedding). No
FreeSerif/FreeSans/generic fallback anywhere — the silent-FreSerif defect is
absent by construction.

## Layout verification

- Both pages fit with no overflow (content bottom < page bottom, both pages;
  measured by render.mjs inspection harness — no clipped ending).
- pdfinfo: Pages=2, 612x792pt.
- All 7 photos render complete (naturalWidth/Height present) and are
  subject-safe: portrait photos (photo2, photo5, photo1) get explicit
  object-position anchors so faces stay in frame — each verified at full
  resolution via element screenshots (fig crops). Landscape photos (photo3,
  photo4, photo6, photo7) verified well-framed by vision review.
- Captions carry "(photoN)" source tags deliberately: this is a design
  specimen for layout selection, not the final copy pipeline.

## Note for the integration task (t_d3fbe9a6)

- The per-figure `object-position` anchoring (`.crop-low`, `--low` custom
  property in specimen.html) is a manual stand-in for the TRI-R05
  subject-safe crop service; the automation should keep its
  cover/contain + anchor logic rather than hard-coding these values.
