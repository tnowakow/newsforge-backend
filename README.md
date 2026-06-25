# NewsForge Backend

AI-driven newsletter layout engine for senior-living communities. Demo for Porter One Design.

**Stack:** Node 22 · TypeScript · Express · Prisma · PostgreSQL · Puppeteer (`@sparticuz/chromium`) · Gemini 2.5 Flash.

This is the **backend** half of NewsForge. The React SPA (Maya) lives in a sibling repo.

---

## Repo layout

```
/                          # npm workspaces root
├── prisma/
│   ├── schema.prisma      # Vitaly §2 — locked schema
│   └── seed.ts            # 25 clients + 10 templates + filler pool (idempotent)
├── packages/
│   └── shared/            # @newsforge/shared — Zod schemas, DTOs, stable IDs
└── apps/
    └── api/               # @newsforge/api — Express server
        └── src/
            ├── index.ts             # bootstrap, listen, shutdown
            ├── env.ts               # Zod-validated env
            ├── db.ts                # Prisma singleton
            ├── middleware/
            │   ├── aiAuth.ts        # timingSafeEqual password + cookie + soft lockout
            │   ├── localOnly.ts     # 127.0.0.1 + secret guard for /render
            │   ├── rateLimit.ts     # per-IP token buckets
            │   └── errorHandler.ts
            ├── routes/
            │   ├── clients.ts       # GET /, GET /:id, POST /:id/mock-content
            │   ├── templates.ts     # GET /
            │   ├── runs.ts          # POST, GET, /filler, /edit, /ai-edit, /pdf, /ai-edits
            │   ├── uploads.ts       # POST / (multipart: images, .docx, .txt, pasted text)
            │   ├── render.ts        # internal HTML for Puppeteer
            │   └── health.ts        # /api/health — db + Chromium + last render
            └── services/
                ├── mockContentService.ts  # deterministic per (clientId, monthLabel)
                ├── assemblyService.ts     # walks template slots → assembled layout
                ├── fillerService.ts       # Gemini filler OR placeholders + fallback pool
                ├── aiEditService.ts       # Gemini ai-edit + deterministic reshuffle fallback
                ├── geminiService.ts       # 7s timeout, 2 retries, Zod-validated JSON
                ├── pdfService.ts          # Puppeteer singleton (one browser, one page)
                ├── renderHtml.ts          # server-rendered print HTML
                └── uploadService.ts       # mammoth for .docx, text passthrough, EXIF note
```

## API surface (per Vitaly §9)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | DB + Chromium + uptime |
| `GET` | `/api/clients` | List all 25 |
| `GET` | `/api/clients/:id` | Full brand kit |
| `POST` | `/api/clients/:id/mock-content` | Deterministic per (clientId, monthLabel) |
| `GET` | `/api/templates` | List 10 |
| `POST` | `/api/runs` | Create + assemble |
| `GET` | `/api/runs/:id` | Full run DTO |
| `POST` | `/api/runs/:id/filler` | AI filler OR placeholders (per run.fillerMode) |
| `POST` | `/api/runs/:id/edit` | Manual block ops (move/resize/delete/swap-content) |
| `POST` | `/api/runs/:id/ai-edit/unlock` | Password gate (timingSafeEqual + soft lockout) |
| `POST` | `/api/runs/:id/ai-edit/lock` | Drop the unlock cookie |
| `POST` | `/api/runs/:id/ai-edit` | Gemini 2.5 Flash → ops → apply → persist before/after |
| `GET` | `/api/runs/:id/ai-edits` | Recent prompts (Sofia Screen 6) |
| `POST` | `/api/runs/:id/pdf` | Render via Puppeteer (cached, invalidated on edit) |
| `POST` | `/api/uploads` | multipart: images + `.docx` + `.txt` + pasted text |
| `GET` | `/render/:id` | Internal-only HTML for Puppeteer (127.0.0.1 + secret) |

## Vitaly's hard rules (§6) — how they're honored

1. **Zod at the JSON boundary** — every column is parsed via `@newsforge/shared` schemas (`parseJson`) before business logic touches it.
2. **Singleton Puppeteer** — `pdfService.ts` keeps one `browser` and one `page`; warmed on boot.
3. **Gemini key never client-side** — only `apps/api/src/services/geminiService.ts` reads `GEMINI_API_KEY`.
4. **Deterministic mock content** — `makeRng()` seeded with `sha256(clientId::monthLabel::v1)`.
5. **AI filler cached** — written into `assembledLayout.blocks[].contentRef.inline`; no re-call on render/PDF.
6. **PDF cache invalidation** — `pdfPath`/`pdfGeneratedAt` cleared on every edit, AI edit, and filler call.
7. **Internal /render** — `localOnlyWithSecret` middleware: 127.0.0.1 only AND `x-internal-render-secret` header.
8. **Uploads** — stored on the volume at `${DATA_DIR}/uploads/<runId>/...`, 20 MB total cap.
9. **Idempotent seed** — `prisma upsert` keyed on stable IDs from `packages/shared/src/dtos/index.ts`.
10. **No user accounts, no batch, no Phase 2** — confirmed scope.

## Env vars

See `.env.example`. Required in production:

| Var | Why |
|---|---|
| `DATABASE_URL` | Postgres (auto-injected by Railway PG plugin) |
| `GEMINI_API_KEY` | Server-only; never sent to browser |
| `AI_UNLOCK_PASSWORD` | Default `65386538` |
| `INTERNAL_RENDER_SECRET` | Paired with 127.0.0.1 check on `/render/:id` |
| `COOKIE_SECRET` | Signs the `aiUnlocked` cookie |
| `APP_BASE_URL` | Used in logging + future browser callbacks |
| `DATA_DIR` | Volume mount path (Railway: `/data`) |

## Local development

```bash
# 1. Install
npm ci

# 2. Local Postgres (your choice — docker, brew, etc.)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/newsforge"

# 3. Generate client + run first migration
npx prisma generate
npx prisma migrate dev --name init --schema prisma/schema.prisma

# 4. Seed
npm run seed

# 5. Build + run
npm run build
npm start
# or hot reload:
npm run dev
```

## Railway deploy

1. New project → add PostgreSQL plugin.
2. Add this repo as a service (single service).
3. Mount a 1 GB volume at `/data`.
4. Set env: `GEMINI_API_KEY`, `AI_UNLOCK_PASSWORD`, `INTERNAL_RENDER_SECRET`, `COOKIE_SECRET`, `DATA_DIR=/data`.
5. Deploy — `nixpacks.toml` handles install/build. `railway.toml` runs the release command:
   ```
   npx prisma migrate deploy && npx tsx prisma/seed.ts
   ```
6. Health check: `GET /api/health` → `{ status: "ok", db: { ok: true }, pdf: { ready: true } }`.

## What this repo does NOT include

- The React SPA / preview tree — Maya's repo.
- True print-production correctness — Phase 2 per JayJay.
- Multi-tenant auth, batch processing, approval workflow — explicitly out of scope.
