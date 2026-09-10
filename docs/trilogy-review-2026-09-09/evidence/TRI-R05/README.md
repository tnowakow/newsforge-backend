# TRI-R05 evidence

Integrated SHA: `5669fb9c36a372164c5deb88b33901cd4c9c5779`

## Implemented
1. `imageDescription.ts` — vision pixel describe (Gemini/OpenAI), cache by content hash + model + promptVersion `trilogy-r05-v1`. No people IDs / medical inference. Unavailable providers leave `analysisStatus=unavailable` (no fabricated scene).
2. `photoAssignment.ts` — global visible-evidence ranking; deleted Legacy→veteran TOKEN_ALIASES shortcut; exact/confirmed reserved first; weak evidence stays UNASSIGNED; no metadata-scorer-as-inspection claim.
3. `subjectSafeCrop.ts` — subject-safe cover/contain + alternatives; narrow rails force contain for multi-person/wide subjects; DPI remains separate (`assessPrintDpi`).
4. `sourceManifest.ts` — two-pass exact-then-global-inferred; multi-exact may share an image; inferred cannot steal reserved.
5. Upload path stores contentAnalysis/analysisStatus/crop fields; renderer re-applies subject-safe crop from block frame aspect.

## Tests
```
DATABASE_URL=... AI_UNLOCK_PASSWORD=... INTERNAL_RENDER_SECRET=... \
  npm -w @newsforge/api exec -- tsx --test \
  src/__tests__/photoAssignment.r05.test.ts \
  src/__tests__/sourceManifest.test.ts
```
Result: 18 pass / 1 fail (Ashford birthdayPresent — pre-existing on clean main, not introduced by R05).

R05 acceptance coverage in photoAssignment.r05.test.ts:
- Dining → culinary Chef Circle
- Legacy title alone ≠ veterans
- Military body + medals photo assigns veterans; second slot unassigned
- No vision → unassigned with provider recorded
- No duplicate inferred placement
- Exact reserves before inferred
- Five-person + chess narrow rail → contain; wide frame can cover
- Shuffle stability

## Commands verified
- npm run typecheck — pass
- npm run build — pass
- Targeted R05 tests — 18/19 (Ashford pre-existing)

## Not done (out of scope / no live keys)
- Live vision describe of photo1–7 on this host (GEMINI/OPENAI unset)
- Production deploy (not authorized by card)
