# Trilogy inner spread review

Reviewed September 9, 2026. Scope: Trilogy, newsletter pages 2 and 3. This is an audit and execution plan, not an implementation or a new production-readiness certification.

## Main finding

The quality gap comes from incomplete source interpretation, disconnected layout and photo decisions, incorrect typography, and validation that does not prove what is visible in the exported PDF. There is also a concrete integration failure: two completed Hermes implementations are absent from the rehearsed candidate. More prompt changes or a higher internal affinity score will not resolve that chain of failures.

## What was inspected

All five requirements Markdown files; all nine DOCX files (blank plus eight filled); seven supplied photos; all 30 reference PDFs, visually scanned as normalized inner spreads; the five saved Round 5 outputs; current checkout f0fd153; saved candidate d4e0e53; the Hermes board, prior plan, branch graph, and exact fallback PDF named by DEMO-READY.json. Current and candidate parsers were executed locally against all nine DOCXs. Content5 was also rendered to confirm its numbered story boundaries. Selected reference fonts were inspected using pdffonts and pdfplumber.

No new live generation, deployment, provider call, or production health verification was performed. Rehearsal claims below are attributed to saved records, not a claim about the current live server. No application source was changed.

The supplied DOCX is a **content submission form**, not the newsletter's page-layout master. The blank form explicitly assigns inside content to the campus and front/back to the home office. Separate those two meanings of template in the product and data model.

## The existing Hermes work must be reconciled first

The default board is `/home/tom/.hermes/kanban.db`. Eleven NewsForge parent cards are already marked done; T09 also has four completed child tasks. The prior evidence package is `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/`.

| State | Verified revision | What it means |
|---|---|---|
| Current workspace main | f0fd153 | Older implementation; August outputs are relevant historical evidence only. |
| Rehearsed candidate named in saved records | d4e0e53 | Includes source-manifest, typography, preview and metadata photo-assignment work. |
| Latest demo branch | a8a46e6, fix/t_a7e7263c-print-contract | Adds demo documentation after d4e0e53. |
| Completed T06 branch | cf6fd19, fix/t_e30c1681-layout | Not an ancestor of d4e0e53. Adds innerSpreadComposer. |
| Completed T08 branch | 23df435, fix/t_6d2f4141 | Not an ancestor of d4e0e53. Adds finalArtifactGate and route checks. |

A done card is not proof that its commit was integrated. Do not blindly cherry-pick both branches and declare success: the composer still estimates rows from word counts, sets clipCount to zero, and never invokes the story measurement service. The final gate passes its expected page count from the same layout value as its actual count and supplies configured font sizes as if they were measurements. Both need review and completion.

The old PLAN/START-HERE documents still say proposed/audit-only, while DEMO-READY says approved. Preserve their historical records and create a new, revision-specific acceptance record. The user request here is for a plan, not a change to the previous approval or a deployment.

## Visible defects in the newer saved PDF

Exact source: `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/rehearsal/d4e0e53e5365c1587eef9cc08e29c52cb331494b/pass2-resolved/screenshots/captured-web.pdf`. SHA-256: `c4d84e1f5acad80c6d274efb1c7f4ad59cd96329bf306ed86d63fd31d77256b1`.

1. On page 2 the director letter stops at “making the most of these”. Its supplied ending about longer days, invitation, closing and signature is not visible. The byline at the top is not a substitute for the omitted closing.
2. On page 3 the anniversary story stops at “From memorable events”; its remaining sentences are not visible. Page 2's Chef Circle bottom line also meets/crosses its clipping boundary. Text extraction alone cannot establish full glyph visibility: compare actual glyph bounds and the raster.
3. The two veterans' photo is captioned “Chef Circle”; the dining photo is captioned with the Campus in Color heading. This contradicts the intended photo choices reported in the demo limitations. Whatever was resolved upstream did not govern the final placement/caption consistently.
4. Wide group photos are squeezed into tall frames: the chess photo loses the man entirely and clips the woman's face; the five-person group loses the edge people. Photo count 7/7 does not measure crop quality.
5. Brunch's single row gets a very tall dark panel; dated rails have excess empty interiors; large bold body text and long duplicated headings compete for attention. This is not how the supplied examples allocate space.
6. The outer label says June 2026 while the letter and schedules say July. This is an issue-metadata conflict to surface, not evidence that the model invented a date.

The saved review called the artifact clean and disproved some alleged visual problems using pdftotext. That method is insufficient: text can exist in PDF drawing commands while being partly clipped. Here several full ending phrases are also absent from the extracted inside-page text. A new acceptance run must check exact source coverage and visible geometry together.

## What Will's layouts actually do

Examples 01–05 are one 17×11 PDF spread; 06–30 are two Letter pages. Their physical PDF page numbers differ from newsletter page numbers. Compare the left and right inside pages at equal physical scale.

Across the corpus, page 2 often establishes a narrow utility rail beside a wider director module. Page 3 adapts much more: a wide story with a side rail, a photo-led feature, compact stacked briefs, or a mosaic grouped under a short headline. Examples 02/06 show clear story/photo groups; 05/11/17 show denser photo groupings; 01/14 show sparse alternatives; 18/26/27/29 demonstrate longer copy, columns and wrapped images. Examples 21–30 add useful August variants that the current 20-entry retrieval table ignores.

The shared grammar is consistent margins and gutters, readable type, varied photo proportions, strong but selective panels, short headings, and story grouping. White page background is allowed. “No white space” should mean no accidental holes or oversized empty panels, not color every square inch. A short brief should remain short; neighboring photos or a different composition absorb spare space.

Font inspection of example-02 identifies Museo Sans 500/900 plus Adobe Garamond Pro variants. The newer fallback PDF embeds FreeSerif variants, although the candidate render contract names Georgia. Merely checking a CSS family string or document.fonts.check does not verify which face the PDF used. The candidate also forces both headings and body to Georgia, bypassing the supplied client brand kit. Obtain the real approved fonts or explicitly approve a local substitute; measure and preview with that exact font set.

Birthdays are common in finished references but absent from many source forms because they may arrive separately. Their visual recurrence does not authorize invented names, a filler roster, or a permanent empty rail. Support an optional, explicitly sourced roster, a birthday narrative, and absent roster as distinct states. Without a roster, recompose the space. Keep outer-page work out of this sprint.

## Source and pipeline defects that remain

- **Blank form:** both f0fd153 and d4e0e53 parse the blank DOCX into two fake articles totaling 35 words, consisting of “Customize…” and “Submit an article…” instructions. This is parser evidence; it does not imply that a subsequent route guard accepts the blank newsletter.
- **Content4:** those same two instructions survive alongside real director/Legacy copy.
- **Content5:** the DOCX visibly has six stories: Director, Legacy, Farmer's Market, Volunteers Needed, Then & Now, Talent Call Out. Both parsers produce 12 units. The transportation heading and six paragraphs become seven cards; several supplied short headings disappear, then body sentences become enormous replacement headings. Raw-text extraction discards useful numbering/run-format evidence.
- **Content6:** the candidate preserves seven ordinal entertainment rows but classifies the resulting unit as brief. Structured schedules need normalized day/month rows, not incompatible date regexes in different layers.
- **Birthdays:** the candidate adds a feature rule that consumes a birthday-mentioned feature even when no valid roster rows were found. A narrative about a birthday must remain a story. The old “use recurring roster or evergreen teaser” warning contradicts the new absent-roster policy.
- **Source ledger:** candidate sourceManifest assigns article paragraph IDs by index into the entire raw document, so they can point into instructions rather than the real article. It is metadata, not yet a trustworthy paragraph-to-layout ledger.
- **Photo understanding:** d4e0e53 scores text metadata; it does not inspect image pixels. Multipart image intake supplies dimensions/filename but no semantic description. Untagged photo1–7 cannot become intelligently matched from absent descriptions. The Legacy→veteran alias is also semantically wrong for memory-care Legacy News. A topical match is not proof of a particular event or person's identity.
- **Photo decisions disconnected:** sourceManifest.photoLinks are built at upload but are not consumed by run assembly; the UI uses its own filename map. Its manual resolver replaces refs with image IDs while the planner's matcher considers caption/alt/description/URL, not image ID or originalName. Resolve once into stable asset IDs, then carry those links through every stage.
- **Measurements disconnected:** the candidate defines measureStoryModule(s), but no production caller uses those functions. Its markup and CSS also differ from the actual newsletter renderer. A helper's existence does not constitute measured composition.
- **Wrong mode:** the candidate UI never sends layoutMode:campus-inner-spread. Its route therefore retains the full-issue wrapper behavior by default. A two-page internal mode must still support a four-page delivered issue by inserting the finished spread between existing outer pages.
- **Proxy scoring:** retrieval uses 20 hard-coded signatures; reference scoring checks block/color/area ranges, not rendered reference images. Those are useful diagnostics, not a percentage of design similarity. Actual final typography, crop quality, missing endings and true story boundaries must outrank them.

## Requirements clarification

The original requirements cover a much larger SaaS build. This plan implements the layout-quality portion of FR-2.4, FR-4, FR-6.4 and FR-9, with the minimum reliable proof path. It does not re-open tenancy, billing, intake-vendor integration, batch jobs, full editor replacement or press/IDML production as prerequisites to improving pages 2–3. Those remain separate obligations from the requirements package.

Define AI's useful job as suggesting concise source-grounded headlines, classifying content, describing visible image content, and ranking viable compositions. Full copy, dates, names and captions remain sourced and auditable. Geometry, fit, and final artifact validation must be deterministic and measurable. Default to preserving copy; any editorial shortening is a visible decision, never an automatic fit repair.

## Deliverables and verification limits

PLAN.md contains ten follow-up cards with concrete acceptance. kanban-cards.json is the import payload. The import helper stages them blocked on the existing default board with dependencies, leaving completed history intact. No agents are started by this review.

Evidence includes hashes for all 51 supplied files, parser summaries for both revisions, selected reference typography, and a labeled visual comparison. The comparison uses example-02 as a design reference with a different photo set; it is not an identical-input before/after. Temporary raw extracts and page renders are under /tmp/trilogy-audit and are not required by future cards, which use original source paths and durable evidence.
