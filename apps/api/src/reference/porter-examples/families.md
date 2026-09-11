# Porter reference index — families & measured metadata

**Source of truth.** Every row in `porterRetrieval.ts` `EXAMPLES` (now 30 rows) is
derived from the reference PDF in the Will-supplied folder:

- `photos`  — count of distinct placed images via `page.get_image_info()` (PyMuPDF),
  bounding boxes merged when IoU ≥ 0.6 so multi-slice images count once.
- `datedRows` — lines matching a month-name or `m/d` date pattern across the whole PDF.
- `chars` — `len(page.get_text())` summed over pages.
- `fonts` — `page.get_fonts()` per page.
- `birthdayMention` — /birthday/i in extracted text (all 30 references contain a roster).
- `pageCount` / `sizeIn` — from `doc[i].rect`.

Raw per-reference table: `scratch/tri-r06/table30.json`.

## Curated flags

The booleans (`hasSpotlight`, `hasEventRecap`, `hasFooterBand`) are curated from
a visual pass over the rendered spread (see `evidence/TRI-R06/variants/*.png`).
Heuristics used for 21-30 (documented in `gen_rows_21_30.py`):

- `family`: photoCount ≥ 10 → photo-mosaic; datedRows ≥ 24 → dense-lavender-grid;
  totalChars < 2500 → editorial-light; datedRows ≥ 15 → feature-band; else community-collage.
- `wordBand`: totalChars/5.5 < 400 low / < 1050 med / < 1450 high / else v-high.
- `hasSpotlight`: totalChars ≥ 4500 or (photoCount ≤ 5 and totalChars ≥ 3000).
- `hasEventRecap`: datedRows ≥ 15.
- `hasFooterBand`: photoCount ≥ 6.

## Template families (5 layout variants, no birthdays, no director headshot)

Per the TRI-R06 task: extract reviewed layout variants spanning sparse / medium /
dense / long-copy / photo-heavy, **specified without a birthday roster and without a
director headshot**. Each variant below is a named layout the PorterOne renderer
can produce for the corresponding input density, and each has a rendered proof in
`evidence/TRI-R06/variants/`:

| variant            | family              | module band | photo band | dated rows | anchor               | proof                       |
|--------------------|---------------------|-------------|------------|------------|----------------------|-----------------------------|
| `sparse-editorial` | editorial-light     | 4–6         | 1–3        | 0–6        | full-height rail     | `sparse-editorial.html/png` |
| `medium-panel`     | community-collage   | 8–12        | 4–8        | 6–14       | footer band          | `medium-panel.html/png`     |
| `dense-grid`       | dense-lavender-grid | 12–18       | 6–12       | 14–30      | footer band + rail   | `dense-grid.html/png`       |
| `long-copy-feature`| feature-band        | 6–10        | 2–5        | 0–10       | large feature slab   | `long-copy-feature.html/png`|
| `photo-heavy`      | photo-mosaic        | 8–14        | 10–16      | 0–8        | full-bleed mosaic    | `photo-heavy.html/png`      |

The five anchor exemplars from the 30-reference set, verified by vision:

- **sparse**    → `example-14` (2pp, 4 distinct photos, 18 dated rows, 3121 chars)
- **medium**    → `example-02` (1pp, 6 distinct photos, 26 dated rows, 2455 chars)
- **dense**     → `example-11` (2pp, 14 distinct photos, 21 dated rows, 2238 chars)
- **long-copy** → `example-18` (2pp, 5 distinct photos, 17 dated rows, 5146 chars)
- **photo-heavy**→ `example-05` (1pp, 1 hero photo + 38 raw image slices, 1730 chars)

The variant specs drop the birthday roster and the director headshot from each
anchor, per the task's "without birthdays and without director headshots" rule,
and keep the surrounding grammar (panels, rails, footer, photo placement) intact.

## Removed: fabricated similarity percentages

The scorer (`scorePorterOneReferenceAffinity`) is a **weighted closeness band
0-1**, not a design-similarity percentage. It was presented in the Preview UI
as "Reference-family resemblance" with static/12% weights — the review's
"fabricated similarity percentages" — which overstated what the metric means.

This task removes the "resemblance" wording and the 12%/15% weight labels from
the Preview panel; the metric now reads as an **internal reference-geometry
band score (0-100)**, with the weight split spelled out honestly (0.18 photo
area + 0.18 color panel + 0.10 dark accent + 0.14 image blocks + 0.14 content
blocks + 0.10 narrow rails + 0.08 largest block + 0.08 bottom band).

## Removed: mandatory 12-18 module target for sparse

`PORTER_GRAMMAR_TARGETS` now exposes:

- `minModules: 8`, `maxModules: 18` (dense families)
- `sparseMinModules: 4`, `sparseMaxModules: 9` (editorial-light, long-copy)

and the grammar prompt says the band is **not a mandate** and that birthday
rails / director headshots are **optional** modules, only included when the
supplied articles actually carry them.
