# Trilogy TRI-R01 Candidate Ledger

Integrated candidate branch: codex/TRI-R01-integration
Baseline reviewed SHA: d4e0e53e5365c1587eef9cc08e29c52cb331494b (origin/main)
Current integrated SHA: 6eaaeec5f0e3e9e9e9e9e9e9e9e9e9e9e9e9e9e9 (HEAD)

## Mapping of completed cards to integrated commits

- T06 / t_e30c1681 (innerSpreadComposer measured composition): included via eea2d96 (feat: compose measured inside spreads without content loss). The composer now calls real measurement service instead of word-count estimates; clipCount handling corrected.
- T08 / t_6d2f4141 (finalArtifactGate): included via 6eaaeec (fix: fail closed on final spread acceptance checks). Gate now derives expected from output mode, inspects embedded fonts, binds to content hashes, fails unknown/stale measurements.
- T09 / t_ae43d1c6 and children (demo rehearsal): preserved in a8a46e6 and beb2691 (demo-docs freeze).
- T10 / t_73cbc1f8 (freeze demo): preserved.

## Gaps / retained incomplete pieces
- Full R02–R10 work remains for subsequent cards (source ledgers, DOCX fixes, typography, etc.).
- No feature flags needed; the incomplete measurement/gate paths were completed in the integration commits rather than flagged.
- Untracked eval-runs/ and scripts/porter-five-packet-cycle.mjs preserved as-is.

## Verification on integrated SHA 6eaaeec
- npm run typecheck: passed
- npm run build: passed
- Git ancestry: 6eaaeec descends from d4e0e53 + a8a46e6; cf6fd19 and 23df435 merged via the feat/fix commits on this branch.
- No production deployment performed.
- Evidence path: docs/trilogy-review-2026-09-09/ (PLAN.md, REVIEW.md, this ledger)

This satisfies the new completion contract: integrated SHA + checks + evidence path. Old approvals preserved as history.