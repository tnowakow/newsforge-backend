# Demo rehearsal status

Status: COMPLETE (review lane) — awaiting Tom's appearance APPROVAL or NO-GO (human gate, deadline 2026-09-10).

Candidate deployed & verified

- Commit / deployed SHA: `d4e0e53e5365c1587eef9cc08e29c52cb331494b` (verified from Railway `deployment.meta.commitHash`, not health)
- Environment: production, `https://api-production-26a0.up.railway.app` (existing hobby service; no new paid infra)
- Client under test: Trilogy Health Services (`cf9d5c48ad3397d431d1e6cd`) — the primary demo target
- Local gates (preflight): API test 169/170 (1 skip = missing checkout-local July fixture), typecheck PASS, workspace builds (shared/API/web) PASS, `git diff --check` clean, live `/api/health` ok.

Local verification (evidence: `evidence/rehearsal/d4e0e53e…/`)
- API suite, typecheck, build, diff-check logs all present with real exit codes.
- OAuth-only Sonnet routing confirmed (setup-token, not a paid API key). Note: the OAuth setup-token was EXPIRED (401) at preflight time; re-auth is required for any live AI inference call.

Rehearsal (real-browser click path)
- Two full UI passes (Puppeteer, real DOCX + 7 photos, hashes verified): password gate → client → upload → preflight → resolve optional links (2 resolved, 3 honestly left unresolved — no defensible match) → Assemble → preview → ordinary "Download Web PDF".
- Genuine 4-page letter PDFs captured each pass (Skia/PDF m150, ~2.39 MB); 7/7 photos fitted, 0 dropped; source content verified present via `pdftotext`.

Review lane (this update)
- Independent visual review: content verified CLEAN via `pdftotext`; vision-flagged "typos" were all disproven as hallucinations (correct date JUNE 2026, "Proud", byline "Elise Van De Steenoven", "shared … trinkets", complete Chef Circle sentence). Layout/type-hierarchy/whitespace clean in the approved export.
- Paired contact sheet built (output pages + reference pages + 7 photos).
- Stability: 2 further full generations (4 total); all identical 4pp, ~2.39 MB. Measured durations: 77.4 s / 129.2 s / 157.5 s / 151.5 s (real, from logs — not estimates).
- Deliberate bad-upload/overflow: garbage `.docx` and corrupt `.png` handled without 500/hang; overflow (full content, 0 photos) returns a DESCRIPTIVE `409 quality_gate_blocked` ("render-clipped-blocks: 2 …", "below the 60% ship floor — re-arrange, or force the download") — i.e. it explains the failure and withholds export rather than 500/hang/silent force-download.
- Held-out (Oaks/Byron): NOT run — the Oaks DOCX has no embedded media and no Oaks photos were recovered anywhere on disk; skipped honestly rather than faked. Disclosed limitation until the real Oaks photo set is supplied.

Pending (human-only)
- Tom's appearance APPROVAL or NO-GO on the generated PDF + paired contact sheet. Internal review supports shipping but does not overrule his decision.

Full review detail: `evidence/rehearsal/d4e0e53e…/REVIEW-RESULT.md`
