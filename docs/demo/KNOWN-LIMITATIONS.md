# Known limitations and go/no-go state

Last verified rehearsal: 2026-09-09 UTC
Candidate: `d4e0e53e5365c1587eef9cc08e29c52cb331494b`
Scope: Trilogy Health Services, one uploaded DOCX plus seven uploaded JPEGs.

## Current state

The production UI click path was exercised successfully four times. Each run produced a genuine four-page US Letter Web PDF through ordinary export; the review record reports all seven photos fitted, no dropped photos, stable content, and a descriptive 409 on a deliberate overflow case. This supports a constrained demo pilot for the exercised packet shape only.

The candidate is not marked finally approved here. Tom's appearance approval or no-go is still required. Until that decision is recorded, the code and fallback remain candidates/rehearsal evidence, not an approved immutable release.

## Known limitations

1. This is not product-wide layout readiness. Only the Trilogy packet shape was exercised as the primary demo. Ashford remains a named-reference regression fixture; Oaks was not run because its original photos were unavailable.
2. The uploaded Trilogy DOCX names photos that were not present in the upload. The rehearsal resolved only two defensible links: `Legacy.jpg` to `photo2.jpg` and `Chefs Circle.jpg` to `photo5.jpg`. `Legacy 2.jpg`, `Campus in Color.jpg`, and `Campus in Color 2.HEIC` remain unresolved. No filename-order or visual guess should be presented as ground truth.
3. The generated result is four pages for this packet. The source/outer-page contract and any separate centrally supplied front/back content must be discussed honestly; do not imply that campus content supplies approved central-office pages.
4. The fallback PDF is previously generated on 2026-09-09 UTC. It is a safe demonstration backup, not a live Thursday generation and not evidence that the current network/model path is available.
5. Live access, meeting time/timezone, browser session, and Thursday availability must be checked immediately before the meeting. Credentials must stay out of this document and all logs.
6. The read-only preview is authoritative for this demo's rendered geometry. Do not claim a full WYSIWYG editor or that preview-only observations prove every export variant.
7. Human operator review remains required. Compliance warnings in the rehearsal were non-blocking warnings, not proof that all editorial or resident-data decisions are approved.
8. A deliberate no-photo overflow run correctly returned an unforced quality-gate 409. Never force that export and call it accepted.

## Explicit non-claims

- No claim of a second real packet passing.
- No claim that unresolved references are correct assignments.
- No claim of a live result when the fallback is shown.
- No claim of Tom's visual approval until he records it.
