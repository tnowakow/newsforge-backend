# @newsforge/web

NewsForge frontend — the demo UI for Porter One Design's AI newsletter layout
engine. React 18 + TypeScript + Vite + Tailwind, shared DTOs imported from
`@newsforge/shared`.

## Quick start

From the **repo root** (`dev-team/newsforge/newsforge-backend`):

```bash
# Install (workspaces hoist everything)
npm install

# Make sure the shared DTOs are built (the web app imports the compiled output)
npm run build:shared

# Terminal 1 — start the API
npm run dev               # serves the API on whatever PORT you've set

# Terminal 2 — start the web app
npm -w @newsforge/web run dev
# → http://localhost:5173
```

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and tweak as needed.

| Var | Purpose | Default |
| --- | --- | --- |
| `VITE_API_URL` | Absolute API origin used by `fetch()` calls. Leave **empty** in dev (so the Vite proxy handles routing) and in Railway prod (same-origin). | `""` |
| `VITE_DEV_PROXY_TARGET` | Where the Vite dev server proxies `/api`, `/uploads`, `/pdfs`, `/render`. | `http://localhost:3001` |
| `VITE_DEV_RENDER_SECRET` | Must match the API's `INTERNAL_RENDER_SECRET`. The dev proxy injects this header on every `/render/*` request so the iframe preview works. | `change-me-in-prod` |

> **Note on the API port:** the spec asks for `http://localhost:3001`. The
> backend currently defaults to **3000** (see `apps/api/src/env.ts`). Either
> run the API with `PORT=3001 npm run dev`, or set
> `VITE_DEV_PROXY_TARGET=http://localhost:3000` here.

## Production build

```bash
npm -w @newsforge/web run build
# Output: apps/web/dist/
```

In Railway the API is expected to serve `dist/` from the same origin (Sam's
job). With `VITE_API_URL` empty the SPA will hit `/api/...` relative URLs which
land on the same API instance — no CORS, no extra config.

## What's in here

| File | What |
| --- | --- |
| `src/App.tsx` | Router. Three routes: `/`, `/clients/:id`, `/runs/:id`. |
| `src/api/` | `client.ts` (fetch wrapper + `ApiError`) and `endpoints.ts` (typed wrappers around every API call we use). |
| `src/lib/` | `brand.ts` (writes the brand CSS variables), `fonts.ts` (loads Google Fonts), `richness.ts` (badge mapping), `cn.ts`. |
| `src/components/` | `NavBar`, `ClientLogo`, `ColorSwatches`, `RichnessBadge`, `ProcessingOverlay`, `AIPromptModal`, `states.tsx` (loading / empty / error). |
| `src/pages/` | `ClientPickerPage`, `ClientWorkspacePage`, `PreviewPage` (preview + edit + AI modal), `NotFoundPage`. |

## How the screens map to the spec

| Spec screen | Component | Notes |
| --- | --- | --- |
| 1 Client Picker | `ClientPickerPage` | Calls `GET /api/clients`; search + richness filter; skeleton, empty, and error states. |
| 2 Client Workspace | `ClientWorkspacePage` | Top bar with filler toggle and Assemble CTA; left content panel with Mock/Upload tabs; right Brand Kit panel. Applies the client's brand colors to CSS vars and loads its Google Fonts. |
| 3 Processing Overlay | `ProcessingOverlay` | Hand-built SVG of pulsing nodes; cycles four status lines; appears when `POST /api/runs` fires and stays until the polling loop sees `READY`. |
| 4 Preview Screen | `PreviewPage` | Iframe loads `/render/:runId?v=:layoutVersion`. Thumbnails on the left (SVG of the assembled layout grid), Download PDF + Edit + AI Prompt on top. |
| 5 Edit Mode | `PreviewPage` (with `editMode=true`) | Right inspector panel: pick a block, edit X/Y/W/H, swap to placeholder, delete. Pending ops sent to `POST /api/runs/:id/edit` on Save. |
| 6 AI Prompt Modal | `AIPromptModal` | First call tries `GET /api/runs/:id/ai-edits`; 401 → password screen; `POST /unlock` then `POST /ai-edit`. Surfaces `Retry-After` lockout countdown. |

## Polling

After `POST /api/runs` we poll `GET /api/runs/:id` every 1.5 s for up to 90 s.
On `READY` we navigate to `/runs/:id`. On `ERROR` the overlay shows the
backend's error message and the user can dismiss.

## Iframe preview, a note for Sam (security) and Riley (QA)

The API's `/render/:id` route is locked down to `127.0.0.1` **and** a secret
header (`x-internal-render-secret`). That's perfect for Puppeteer but blocks
direct browser access.

In **dev** we solve this by proxying `/render/*` through Vite — the request
becomes localhost→localhost on the same box, the loopback check passes, and
the proxy injects the secret header. ✅

In **prod** an iframe straight to `/render/:id` will be **rejected** because
the request originates from the user's machine, not `127.0.0.1`. The
straightforward fix is to add a public, cookie-scoped preview endpoint on the
API (e.g. `/api/runs/:id/preview-html`) that returns the same HTML the
internal route does. Until that exists, prod previews need the iframe URL to
go through a backend pass-through or for the `localOnly` guard to be relaxed
on a new public route. Flagged for Sam to review.

## Drag and drop

The spec mentions `react-dnd`/`@dnd-kit`. Edit Mode currently uses
**click-to-select + numeric inspector** for placement (`@dnd-kit/core` is
installed and ready to wire up to drag handles in a follow-up). All edits
flow through the same `POST /api/runs/:id/edit` API regardless, so adding
drag handles is purely a UI enhancement.

## Conventions

* TypeScript strict mode, no `any`.
* Tailwind only, no other CSS frameworks.
* Brand colors live in CSS variables (`--brand-primary-rgb` etc.) so they
  switch instantly when the user picks a different client.
* All API failures surface a friendly message via `ApiError`. Gemini failures
  specifically map to: *"AI edit unavailable, please try again."*
* Desktop Chrome, 1280 px+ — no mobile breakpoints.
