# TRI-R08 evidence

This directory contains the rendered artifact and verification output for the final-artifact gate.

- `validated-specimen.pdf`: the accepted two-page Trilogy inner-spread specimen copied from TRI-SPEC-2P and inspected by the new PDF gate.
- `pdf-inspection.json`: actual `pdfinfo` page count, `pdffonts` embedded-family results, and SHA-256 of the exact PDF bytes. The observed result is 2 pages, both required families embedded, and no missing required fonts.
- `verification.txt`: typecheck, 27 targeted tests (including real Chromium ancestor clipping and real PDF inspection), build, and diff-check output.

The deliberate Chromium fixtures reproduce clipped Executive Director and Chef endings while the full source remains in upstream JSON; both blocks are detected as clipped. A separate fixture proves an unplaced Anniversary source unit fails visible-copy coverage. Gate fixtures also reject missing images/fonts, stale crop-bound reports, unknown measurements, wrong page counts, and missing output hashes. Large intentional whitespace is emitted as a design-review warning, not a correctness failure.

No deployment was performed.
