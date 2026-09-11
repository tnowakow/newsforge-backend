# TRI-R07 — measured module composition

## What changed

- `storyModuleMeasurement.ts` now measures with production-aligned markup/CSS (section-heading, body paragraphs, byline, list rows, photo frames + captions) and LETTER_RENDER_CONTRACT fonts/sizes (Source Sans 3 / EB Garamond @ 11.5pt body floor). Fonts + images are awaited. Cache key invalidates on width/text/caption/font/crop/zoom/fit changes.
- `innerSpreadComposer.ts` no longer uses word-count row estimates or `clipCount=0`. It calls `measureStoryModule` (or an injected measure in unit tests), converts measured heights to grid rows, searches R06 skeletons (`sparse-editorial` … `photo-heavy`), places **all** linked photos (not first-two), places unassigned gallery images, compact-caps short brunch/schedule rails, and emits explicit overflow review options instead of silent trim/type squeeze.
- `aiLayoutDesigner.ts` campus-inner-spread production path uses the measured composer at the approved type floor and records `measure:storyModule` / `measurements:calls=N` in the prompt audit.

## Verification

```text
npm run typecheck   # green
npm run build       # green (shared + api + web)
npm -w @newsforge/api run test:only -- \
  src/__tests__/innerSpreadComposer.test.ts \
  src/__tests__/storyModuleMeasurement.test.ts \
  src/__tests__/storyModuleMeasurement.chromium.test.ts
# → 26/26 pass
```

Live Chromium evidence: `measured-compose.json` (sparse fit, primary-8 fit via long-copy-feature, production designLayout path proves measurement calls).

## Acceptance map

| Criterion | Evidence |
|---|---|
| Measured functions called; drive placement | chromium tests + designLayout model `measured-inner-spread`; taller copy → more rows unit test |
| Cache invalidates on width/text/caption/font/crop | chromium cache test |
| 2-story sparse / primary 8 / Content5 long / dense photo | unit cases + measured-compose.json |
| No tall brunch slab | compact-rail brunch test |
| All linked + gallery images retained | unit tests |
| Honest overflow, no silent trim | overflow reviewOptions; contentEdits always [] |
| Type floor preserved | bodyPt locked to contract 11.5 |

No production deployment.
