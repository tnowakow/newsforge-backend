# Thursday demo script — NewsForge

Status: rehearsal complete; appearance approval and Thursday access check are pending. This is a constrained Trilogy Health Services demonstration, not a product-wide readiness claim.

## Before the meeting

1. Confirm the meeting time and timezone with Tom.
2. Confirm the browser session can pass the password gate. Do not record or paste the password.
3. Verify the browser is using the frozen deployed candidate SHA `d4e0e53e5365c1587eef9cc08e29c52cb331494b`.
4. Keep the previously generated fallback PDF available locally:
   `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/rehearsal/d4e0e53e5365c1587eef9cc08e29c52cb331494b/pass2-resolved/screenshots/captured-web.pdf`
5. Keep the paired review sheet available:
   `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/rehearsal/d4e0e53e5365c1587eef9cc08e29c52cb331494b/contact-sheet-paired.jpg`

The fallback is labeled previously generated. It must never be presented as a live result.

## Live click path (brief)

1. Open `https://api-production-26a0.up.railway.app`.
2. Unlock the demo using the authorized browser session.
3. Select `Trilogy Health Services`.
4. Open Upload and select the source DOCX plus `photo1.jpg` through `photo7.jpg` from the private packet at:
   `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/inputs/wills-original/`
5. Pause at Source preflight. Show that the DOCX and each uploaded photo are inventoried, dimensions are preserved, and unresolved named references are visible.
6. Explain the verified photo decisions: `photo2.jpg` is the defensible Legacy News match and `photo5.jpg` is the defensible Chef Circle match. Do not claim matches for `Legacy 2.jpg`, either Campus in Color reference, or the absent HEIC.
7. Assemble the inside spread and open the read-only preview served by the PDF renderer.
8. Compare the generated pages with the paired reference sheet. Discuss story grouping, type hierarchy, image proportions, whitespace, and any operator warnings.
9. Use ordinary `Download Web PDF`; do not use a forced export. A quality-gate 409 is a failure signal, not an acceptance.
10. If the live path fails, stop and show the labeled fallback with its run ID and limitations.

## What to say

- "This demonstrates one supported Trilogy packet shape: an uploaded DOCX with an un-named photo batch and inspectable, content-based assignment."
- "The preflight is part of the product: unresolved or ambiguous links remain visible instead of being guessed."
- "This PDF was generated in a verified rehearsal. The backup is previously generated, not a claim that today's network or model succeeded."
- "Operator review remains required; Tom's appearance approval is the go/no-go."

## Evidence references

- Deployed SHA: `d4e0e53e5365c1587eef9cc08e29c52cb331494b`
- Client ID: `cf9d5c48ad3397d431d1e6cd`
- Rehearsal run IDs: `jopwrnh9hy1ykyt964t7qbbk`, `qk08jl4o8znrxzndc51x67uk`, `ygab3vi4x5as53j1q9bylunt`, `malfwotb9eciy5u5nkycsl5p`
- Full trace: `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/rehearsal/d4e0e53e5365c1587eef9cc08e29c52cb331494b/REHEARSAL-RESULT.md`
- Independent review: `/home/tom/.hermes/plans/newsforge-demo-2026-09-10/rehearsal/d4e0e53e5365c1587eef9cc08e29c52cb331494b/REVIEW-RESULT.md`
