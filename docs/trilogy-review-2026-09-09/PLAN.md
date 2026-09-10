# Trilogy pages 2 and 3 execution plan

This plan follows the September 9 audit in REVIEW.md. It extends the existing Hermes NewsForge work instead of replacing its completed history. It is staged for review; implementation is not started by creating these cards.

## Scope and success

Generate a natural, source-complete Trilogy inner spread using the actual DOCX and accepted uploaded photos. Pages 1 and 4 are fixed outer material; assembling a four-page issue must not redistribute inner content. Missing birthdays are normal: omit the roster and adapt the layout unless separately sourced data is supplied. AI can assist interpretation, image description and layout ranking; it cannot guarantee fit or invent missing facts.

Keep the existing TypeScript/React/Chromium stack. Reuse the parser, source ledger, crop fields, preview route and useful branch work after verification. The major missing pieces are integrated execution, semantic story boundaries, actual image descriptions, a shared art-directed render vocabulary, measured composition and final visible-content verification.

## Kanban operation

Use the existing default Hermes board at `/home/tom/.hermes/kanban.db`. New cards are prefixed Trilogy TRI-Rxx and link their related previous task IDs in the body. All cards are initially **blocked (plan staged)**. The dependency chain is deliberately sequential to avoid another unintegrated branch handoff. Do not modify global dispatcher settings or start workers as part of import.

On an explicit start request, release only TRI-R01. After each card is implemented and its commit integrated/reviewed, release its successor. Never mark a card done solely on a worker summary. The next card reads the integrated candidate ledger, not a stale checkout. The coordinator may delegate bounded work under the user's chosen Hermes routing once execution is authorized; no provider/model overrides are imposed by this plan.

Sizes are relative complexity (M/L), not calendar estimates or deadline promises. R01 may discover already-finished work; use evidence to narrow later cards rather than duplicate it.

| Card | Work | Priority | Size | Depends on |
|---|---|---|---|---|
| TRI-R01 | Reconcile completed Hermes branches into one verified candidate | Critical | M | — |
| TRI-R02 | Freeze independent source ledgers and failing visual benchmarks | Critical | M | TRI-R01 |
| TRI-R03 | Finish lossless DOCX parsing and optional birthday semantics | Critical | M | TRI-R02 |
| TRI-R04 | Make one source and asset contract control placement end to end | High | M | TRI-R03 |
| TRI-R05 | Add image understanding and subject-preserving crop choices | High | L | TRI-R04 |
| TRI-R06 | Establish the actual Trilogy typography and reference layouts | High | M | TRI-R05 |
| TRI-R07 | Connect real module measurements to bounded page composition | High | L | TRI-R06 |
| TRI-R08 | Validate the actual final PDF and make unknown results fail | Critical | M | TRI-R07 |
| TRI-R09 | Wire the user path to the inner spread and fixed outer pages | High | M | TRI-R08 |
| TRI-R10 | Prove visual quality across the corpus before closing the follow-up | High | M | TRI-R09 |

## Milestones

1. **Trust the candidate:** R01–R03 establish an integrated baseline and independently verified source units.
2. **Trust the design inputs:** R04–R06 make photo decisions persistent, crops safe, and the Trilogy specimen concrete.
3. **Trust the exported result:** R07–R09 connect measurements, gates and the real user path.
4. **Demonstrate generalization:** R10 evaluates different content volumes and a held-out case with human visual judgment.

## Shared acceptance contract

Every required source unit and accepted photo is accounted for in pages 2–3; every story ending, list row and caption remains visibly readable. Changes to source copy are explicit and reviewable. Approved typography and safe photo crops outrank occupancy targets. Missing measurements fail rather than becoming zero defects. A visual pass uses the final PDF at print scale, not just HTML text extraction or a proxy score. No birthday roster, missing headshot, or absent filler pool may be replaced by invented content.

The supplied photo collection has three portraits and four landscapes. This creates a useful crop stress test. It does not prove the photos depict the named events in the DOCX. Use subject/context matching only at its justified confidence level.

## Detailed cards

### TRI-R01 — Reconcile completed Hermes branches into one verified candidate

Related prior cards: t_e30c1681, t_6d2f4141, t_73cbc1f8. Files/components: git branches and worktrees, docs/demo, release/evidence manifest.

Work:

1. Inventory main f0fd153, rehearsed d4e0e53, demo-docs a8a46e6, composer cf6fd19 and gate 23df435. Capture current branch ancestry; inspect subsequent work before editing.
2. Create an isolated codex/ integration branch from the selected reviewed baseline. Preserve current untracked eval-runs and runner. Review and integrate useful missing work; retain incompatible incomplete pieces behind a feature flag instead of silently enabling them.
3. Write a candidate ledger mapping each completed card to its included commit or an explicit remaining gap. Keep this ledger updated after every subsequent card.
4. Change the completion contract: worker completion requires an integrated SHA, relevant checks on that SHA, and an evidence path. Preserve old done cards and approvals as history.

Acceptance:

- Git ancestry proves the exact accepted implementation of T06/T08 is included or its replacement is identified; no claim that a side-branch commit is deployed.
- API tests, typecheck and build run on the integrated revision. Any optional fixture skip is recorded and cannot count as benchmark coverage.
- No production deployment, old-card rewriting, or new worker dispatch as part of the review import.

### TRI-R02 — Freeze independent source ledgers and failing visual benchmarks

Related prior cards: t_15aea534. Files/components: scripts/demo-benchmark.mjs, docs/demo/fixtures, reference index.

Work:

1. Use evidence/input-manifest.json to inventory all nine DOCXs, seven photos and thirty references. Normalize logical pages: 01–05 split one wide page; 06–30 use physical pages 1–2.
2. Create manually reviewed expected ledgers for all eight filled DOCXs and a blank-form negative case. Do not derive expected values by running the same parser. Deduplicate equivalent July/Campus/Content1 cases for tuning but keep all input-file tests.
3. Label style-only comparisons versus true same-packet comparisons. Use recovered Ashford only as an existing Trilogy named-file regression, not another client or a replacement primary target.
4. Capture baseline source-to-PDF omissions, visible crop examples and fonts from the exact saved rehearsal. Once implementation is authorized, generate a fresh isolated local baseline on R01 SHA. Keep archived evidence labeled.

Acceptance:

- Blank expects zero stories. Content5 expects six cohesive stories, preserving the whole transportation article and the supplied short headings. Content6 expects seven July Entertainment entries.
- July primary ledger records five prose stories plus three schedule groups, ten schedule entries and five named references, alongside seven untagged uploaded photos.
- The benchmark fails on missing files or force export; records exact input hashes, revision, render contract, mode and output hashes. Reordering upload files is a separate test.

### TRI-R03 — Finish lossless DOCX parsing and optional birthday semantics

Related prior cards: t_53c3881a. Files/components: uploadService.ts, porterSourceSemantics.ts, sourceManifest.ts, sourceManifest and uploadService tests.

Work:

1. Preserve DOCX paragraph order, numbering levels and useful heading/run-format evidence using Mammoth HTML or OOXML. Group continuation paragraphs under their real headings. Remove instruction spans while retaining adjacent submitted copy.
2. Fix Content4/blank instruction leakage and Content5 fragmentation/title loss. Keep short source headings; propose concise headings for unlabeled stories separately from immutable source text.
3. Build real paragraph-to-unit mappings and stable unit IDs; sourceParagraphIds must identify actual story paragraphs, not raw document array positions.
4. Normalize ordinal/month-based event dates once, preserving original display text and all rows. Distinguish absent birthday roster, real roster and birthday narrative. Remove evergreen-teaser suggestions and never consume a story merely for mentioning birthdays.
5. Preserve original copy and names/dates; keep any established sanitization or approved editorial diff separately auditable.

Acceptance:

- All R02 ledgers match at paragraph/row level. Blank yields zero publishable stories with a clear incomplete-input result.
- Content5 transportation remains one story with all six paragraphs; Volunteers Needed and Talent Call Out retain their headings.
- Absent roster creates no placeholder block; a birthday narrative survives; one real roster preserves every entry; a sparse packet is not rejected merely for lacking birthdays.

### TRI-R04 — Make one source and asset contract control placement end to end

Related prior cards: t_d5a0d088, t_6bdbdc09. Files/components: shared run schemas, sourceManifest.ts, routes/uploads.ts, routes/runs.ts, porterSourceSemantics.ts, SourcePreflight.tsx.

Work:

1. Persist canonical source-unit IDs and resolved image IDs, including exact, operator-confirmed, inferred and unresolved provenance. Carry them from upload through save, preflight, layout, edits and export; keep original references for audit.
2. Reserve all exact links across the entire packet before assigning remaining photos. Eliminate incompatible filename/ID matching rules and prevent one story from stealing an exact match needed later.
3. Fix UI aliases to save real link records; the current ref-to-image-ID replacement must resolve correctly in both preflight and planner.
4. Make inner allocation explicit. A brief is not automatically outer content. Keep all accepted campus stories/photos in pages 2–3; require a recorded reason for any rejected asset.
5. Keep supplied captions attached to their asset ID; do not generate event-identifying captions from unrelated story headings.

Acceptance:

- Exact filenames, image IDs, operator aliases and multiple references resolve consistently across UI, stored run and final layout.
- Photo1 versus photo10 and normalization collisions are covered. Upload order changes cannot change confirmed assignments.
- Changing an alias changes the paired final image and caption after save/regenerate; a two-photo story cannot be reported fully resolved with only one match.

### TRI-R05 — Add image understanding and subject-preserving crop choices

Related prior cards: t_6bdbdc09. Files/components: photoAssignment.ts, image intake/description service, shared image schemas, renderer crop handling.

Work:

1. Describe actual image pixels when a configured vision provider is used: visible scene, objects, orientation and subject bounds. Cache by image hash and model/prompt version. Describe content without identifying people or inferring medical status.
2. Use exact/confirmed links first. Rank remaining pictures globally using visible evidence and story context; return ambiguous/unassigned when evidence is weak. Delete the Legacy-to-veteran shortcut. Do not claim that a thematically suitable test photo documents a particular real event.
3. If image analysis is unavailable, preserve the unassigned state and offer manual choices. Record the actual provider/fallback; do not call a metadata word-overlap scorer image inspection.
4. Choose frame ratios jointly with layout. Use subject-safe focal bounds and crop alternatives; if a crop removes people or important content, change the frame or use contain. Keep low-resolution acceptance separate from crop/DPI diagnostics.

Acceptance:

- The dining photo is a plausible culinary suggestion; veterans are not assigned solely because a section is called Legacy. No artificial fixed photo-number mappings.
- The five-person photo and chess pair preserve all intended people in approved crops; the wide family-table photo is not forced into a narrow rail without review.
- No duplicate placement or invented caption; original seven assets remain recoverable. Exact assignment decisions survive analysis retries and shuffled input.

### TRI-R06 — Establish the actual Trilogy typography and reference layouts

Related prior cards: t_a7e7263c. Files/components: packages/shared/renderContract.ts, renderHtml.ts, fonts/assets, reference metadata, visual specimen.

Work:

1. Obtain approved Museo Sans/Adobe Garamond files already available locally or identify the specific missing assets. Never extract embedded fonts from the reference PDF as an installation shortcut. If required, propose an explicit substitute and visually document it.
2. Use role-specific fonts/weights, physical point sizes, line heights, gutters and column rules. Verify embedded PDF fonts, not CSS names. Selected references use roughly 11–11.5pt body and 23–24pt main headings; use role-specific measured values rather than scaling everything uniformly.
3. Build one manually art-directed, source-complete two-page HTML/PDF specimen using the primary DOCX and all seven test photos, with no birthday roster. Use this to prove achievable design before optimizing automation.
4. Extract reviewed layouts from at least five existing examples spanning sparse, medium, dense, long-copy and photo-heavy input. Specify variants without birthdays and without director headshots. Add 21–30 to the measured reference index and remove fabricated similarity percentages.

Acceptance:

- The specimen has short headings, lighter readable prose, varied safe photos, balanced page 2/3, compact schedules and no clipped ending. Font inspection matches the chosen contract.
- Every template family has source/geometry metadata and a rendered proof. Sparse cases do not inherit a mandatory 12–18-module target.
- Tom/Will can select the appearance target from the concrete specimen. Font absence is explicit, never a silent FreeSerif fallback.

### TRI-R07 — Connect real module measurements to bounded page composition

Related prior cards: t_6c49830e, t_e30c1681. Files/components: storyModuleMeasurement.ts, innerSpreadComposer.ts, porterCompoundPlanner.ts, adaptiveLayoutPlanner.ts, aiLayoutDesigner.ts.

Work:

1. Complete the existing composer rather than trusting its name: replace word-count row estimates and hardcoded clipCount=0 with actual rendered module sizes at candidate widths.
2. Measure with the same production module markup, CSS, font set and photo frames used for export, after fonts and images load. Include headings, all body paragraphs, lists, bylines and captions.
3. Search a bounded set of R06 compositions over two pages, keeping stories and linked photos together. Support flowing longer stories across columns, compact rails, grouped photo mosaics and honest sparse layouts.
4. Preserve all accepted images, including unassigned general-gallery images; do not silently take only the first two linked images. Constrain required content first, then readability/crop safety, then hierarchy and wasted space.
5. Absorb spare area into suitable photos or recomposition. If the source cannot fit at the approved type floor, produce an explicit overflow review with options; never silently trim copy, invent filler or squeeze type below the floor.

Acceptance:

- Production route execution proves measured functions are called and the measurements drive placement. Cache invalidates on width/text/caption/font/crop changes.
- 2-story sparse, primary 8-unit, Content5 long-story and dense photo cases produce valid two-page candidates or honest infeasibility; every source ending remains visible.
- No tall single-row Brunch slab; no photo-only page when meaningful copy can be distributed. All candidates respect the actual available content, not a fixed module quota.

### TRI-R08 — Validate the actual final PDF and make unknown results fail

Related prior cards: t_6d2f4141. Files/components: finalArtifactGate.ts, layoutMeasurementService.ts, runs.ts PDF/edit routes, exportsV3.ts, pdf.ts.

Work:

1. Integrate and complete the orphaned gate. Independently derive expected count from requested output mode; read actual PDF page count. Inspect effective/embedded fonts instead of copying contract values into measured fields.
2. Compare the immutable source ledger with visible final text and DOM/PDF clipping boundaries, including ancestor overflow, headings, captions and list rows. Text extraction alone is insufficient for partly hidden glyphs.
3. Gate the exact stored layout/assets/style revision being exported; regenerate measurements after all layout/crop/manual edits. Bind reports to content, asset hashes, render version and export variant. Unknown, missing or stale measurement cannot pass.
4. Keep correctness separate from design quality. Expose compact explanations for missing copy, broken assets and bad fits. Diagnose intentional whitespace separately from accidental empty regions.
5. Keep force export diagnostic-only and clearly labeled. Apply the final gate to every ordinary proof/approval/export path in scope.

Acceptance:

- Replay the director/anniversary clipped endings and partially clipped Chef line from the current fallback: all must fail despite source text being present upstream.
- Missing font/image, parent-clipped text, stale report after crop edit and wrong page count fail. A legitimate airy sparse layout can pass correctness without pretending to be visually approved.
- No route reports success from actualPageCount=expectedPageCount=the same layout field or from configured font constants. Persist reasons and output hash.

### TRI-R09 — Wire the user path to the inner spread and fixed outer pages

Related prior cards: t_5ef145f2, t_d5a0d088. Files/components: Workspace.tsx, SourcePreflight.tsx, api.ts, Preview.tsx, fullNewsletterWrapper.ts, runHtml.ts.

Work:

1. Ensure real Trilogy uploads actually request the canonical inner-spread path. Preview uses the same render contract and media mode as the downloaded proof.
2. Present source stories, optional roster state, unresolved inferred associations and editable crop previews. Separate the submission form from the newsletter layout choice.
3. Compose pages 2–3 independently, then insert them between supplied/frozen outer pages for a four-page issue. Until real outer masters are available, label the existing demo shell; do not redesign it or source outer copy from inside stories.
4. Persist issue month and highlight a June/July source-label conflict. Save and restore all source/photo/crop choices; editing one article must not reset the rest.
5. Remove brief-to-outer inference and misleading resolved-link statuses. Keep the user workflow concise and useful for a designer.

Acceptance:

- Actual browser request contains the required mode; generated physical pages 2/3 equal the measured inner spread. Outer-page hashes or geometry/content invariants remain unchanged.
- Upload → resolve/suggest photo → adjust crop → generate → preview → ordinary export → reopen is verified with the actual files.
- An absent birthday list creates neither a fake panel nor a blocking error. Selecting July yields consistent issue labels or an explicit conflict to resolve.

### TRI-R10 — Prove visual quality across the corpus before closing the follow-up

Related prior cards: t_ae43d1c6, t_73cbc1f8. Files/components: benchmark harness, acceptance manifest, review contact sheets, Hermes completion records.

Work:

1. Run all eight filled DOCX inputs with the seven supplied photos, retaining sparse/medium/long-copy variants and equivalent-file checks; the blank form is a negative test. Retain any additional real named-photo packet as a regression.
2. Select development and held-out cases before tuning. Repeat the primary case with reordered uploads and record each output. Label unrelated test photos/style-only reference comparisons honestly.
3. Have a reviewer inspect final pages at print scale against the R06 specimen and relevant original references. Score hierarchy, grouping, typography, crop safety, rhythm and wasted space separately from hard integrity gates.
4. Time actual designer corrections against the original ≤15-minute typical-submission goal. Report measured generation/export times with no assumed speed claim.
5. Produce a release manifest with integrated SHA, input/output hashes, actual provider/mode, hard checks, visual review, known limits and reproducible commands. Deployment remains a later explicit action, with the exact candidate reviewable first.

Acceptance:

- No hidden dropped text/photos or force-passed case. All requested packets are accounted for; unsupported dense cases have explicit failure records.
- At least one untouched holdout meets the chosen appearance bar. Passing the same one-packet layout four times is stability evidence only.
- Every card completion names the integrated tested SHA and review evidence. Internal score, card status and historical approval cannot substitute for the exported-page review.

## Deferred work and remaining inputs

A complete SaaS build, production compliance, intake integration, press certification, IDML fidelity, batching and a full designer editor are separate from this visual-quality recovery. Keep their original requirements in the product backlog.

The immediate design input to verify is the approved font/brand asset set. An optional birthday feed and fixed outer masters should have clear source contracts when available. Missing assets do not justify inventing them; the inner-spread engine can still be tested with the supplied corpus and labeled demo shell. Additional true raw-to-finished newsletter pairs improve evaluation; the thirty PDFs alone are not thirty paired training examples.

## Reproducibility and staged import

The companion JSON contains each card's dependencies, file targets, work and acceptance. `import-hermes-plan.py` defaults to dry-run and validates the complete chain before any write. `--apply` uses Hermes's own create_task API inside one transaction, gives every card a blocked status, and writes `hermes-import-manifest.json`. It does not launch workers, change models, or edit existing tasks. Running it again resolves the same idempotency keys.

## Board staging record

Staged September 9, 2026 on the existing Hermes default board. All ten cards were read back as blocked with no active worker or claim. The first card is `t_9688d6fa`; the complete mapping is in `hermes-import-manifest.json`. Existing completed tasks were left unchanged.
