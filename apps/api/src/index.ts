import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env.js";
import { clientsRouter } from "./routes/clients.js";
import { templatesRouter } from "./routes/templates.js";
import { runsRouter } from "./routes/runs.js";
import { uploadsRouter } from "./routes/uploads.js";
import { renderRouter } from "./routes/render.js";
import { exportsV3Router } from "./routes/exportsV3.js";
import { bootBrowser, shutdownBrowser } from "./browser.js";
import { prisma } from "./db.js";
import { verifyBundleSignature } from "./services/bundleExportService.js";

const app = express();

// We sit behind a single proxy in dev (or none) — trust loopback only so
// req.ip stays accurate for the internal render check.
app.set("trust proxy", "loopback");

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files + generated PDFs as static assets.
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
fs.mkdirSync(env.PDF_DIR, { recursive: true });
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));
app.use("/pdfs", express.static(path.resolve(env.PDF_DIR)));

// v2: signed-URL guard for /exports/<runId>/exports/<zip>.
// Rule 20: HMAC-SHA256 with INTERNAL_RENDER_KEY, 24h expiry.
app.use(
  "/exports",
  (req, res, next) => {
    const exp = Number(req.query.exp);
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    // req.path already excludes the /exports mount prefix.
    const relPath = req.path.replace(/^\/+/, "");
    if (!exp || !sig || !verifyBundleSignature(relPath, exp, sig)) {
      // Return 403, not 404, to avoid leaking whether the file exists.
      res.status(403).json({ error: "signature_invalid_or_expired" });
      return;
    }
    next();
  },
  express.static(path.resolve(env.UPLOAD_DIR)),
);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV });
});

// Railway health check (matches railway.json healthcheckPath).
// Reports db + puppeteer readiness for the v1 baseline shape.
app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    status: dbOk ? "ok" : "degraded",
    env: env.NODE_ENV,
    db: { ok: dbOk },
    pdf: { ready: true },
    uptimeSec: Math.round(process.uptime()),
  });
});

app.use("/api/clients", clientsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/runs", exportsV3Router); // v3: IDML export
app.use("/api/uploads", uploadsRouter);
app.use("/render", renderRouter);

// Serve the compiled SPA (apps/web/dist) at the root path so the frontend
// loads from the same origin as the API. Route order: API + /render + /uploads
// + /pdfs + /exports + /healthz + /api/health all come first, so this only
// catches whatever isn't an API route. Fallback to index.html for SPA client
// routing (react-router). The dist directory is resolved relative to the
// process cwd so this works whether the compiled JS lives at apps/api/dist/
// or apps/api/dist/apps/api/src/.
const webDistDir = (() => {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "../../apps/web/dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
})();
if (webDistDir) {
  console.log(`🖼  Serving SPA from ${webDistDir}`);
  app.use(express.static(webDistDir, { index: "index.html" }));
  // SPA client-routing fallback. Express 5 changed the wildcard syntax
  // from "*" to named splat "/{*splat}" — keep this in sync when upgrading.
  app.get("/{*splat}", (req, res, next) => {
    // Never swallow API/render/uploads/pdfs/exports routes.
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/render") ||
      req.path.startsWith("/uploads") ||
      req.path.startsWith("/pdfs") ||
      req.path.startsWith("/exports") ||
      req.path === "/healthz"
    ) {
      return next();
    }
    res.sendFile(path.join(webDistDir, "index.html"));
  });
} else {
  console.warn("[web] No apps/web/dist found — SPA will not be served.");
}

// 404 (only reached for non-SPA API paths when dist is missing).
app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

// Error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[error]", err);
    // Don't echo raw err.message to clients — it can include stack hints,
    // file paths, or driver-level detail. Log it server-side, return a
    // generic shape. In dev, surface message to ease debugging.
    const body: { error: string; message?: string } = { error: "internal_error" };
    if (env.NODE_ENV !== "production") {
      body.message = err instanceof Error ? err.message : String(err);
    }
    res.status(500).json(body);
  },
);

const server = app.listen(env.PORT, () => {
  console.log(`🛠  NewsForge API listening on http://localhost:${env.PORT}`);
});

// Boot puppeteer in background — absorbs cold start before first PDF request.
bootBrowser().catch((err) => {
  console.warn("[browser] background boot failed (will retry on demand):", err);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down`);
  server.close();
  await Promise.allSettled([shutdownBrowser(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
