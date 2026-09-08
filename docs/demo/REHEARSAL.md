# Demo rehearsal status

Status: BLOCKED — no deployment or live browser rehearsal was authorized or possible in this run.

Candidate inspected

- Commit: `d94dc978a9ce5d91835c1ae3ed7c15f448130a46`
- Branch: `fix/t_a7e7263c-print-contract`
- Working tree: dirty only from pre-existing untracked `eval-runs/` and `scripts/porter-five-packet-cycle.mjs`; neither was modified.
- Environment: Node `v26.5.0`, npm `10.9.7`, Linux `6.8.6-060806-generic`.

Local verification

- API suite with command-local dummy environment: PASS — 169 tests, 168 passed, 0 failed, 1 skipped. The skipped test is the missing checkout-local real July submission fixture.
- Typecheck: PASS.
- Workspace builds (shared, API, web/Vite): PASS.
- `git diff --check`: PASS.
- An initial API-suite invocation without the required local dummy `DATABASE_URL` failed environment validation; it did not contact production. The successful command used only dummy values for `DATABASE_URL`, `AI_UNLOCK_PASSWORD`, and `INTERNAL_RENDER_SECRET`.

Evidence

All logs are under:

`/home/tom/.hermes/plans/newsforge-demo-2026-09-10/evidence/rehearsal/d94dc978a9ce5d91835c1ae3ed7c15f448130a46/`

Files: `api-test-dummy-env.log`, `api-test.log`, `typecheck.log`, `build.log`, and `diff-check.log`.

Not performed

- No Railway deployment or push to `main`.
- No deployed-SHA/build-ID verification; `DEMO_API` was unset.
- No authenticated browser path (upload → preflight → resolve links → generate → preview → ordinary PDF download). The production app requires a login/session, and no session was supplied.
- No genuine UI-generated PDF, visual review, stability repetitions, holdout run, or bad-upload rehearsal.

Required unblock

Tom must authorize a disposable/staging deployment and provide an authenticated browser session/access. The real Ashford DOCX and named photos should then be used as the primary packet; the missing Oaks originals remain a disclosed holdout limitation unless recovered.
