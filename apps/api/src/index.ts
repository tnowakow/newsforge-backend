import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs/promises";

import { env } from "./env.js";
import { log } from "./logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { defaultLimiter } from "./middleware/rateLimit.js";
import { clientsRouter } from "./routes/clients.js";
import { templatesRouter } from "./routes/templates.js";
import { runsRouter } from "./routes/runs.js";
import { uploadsRouter } from "./routes/uploads.js";
import { renderRouter } from "./routes/render.js";
import { healthRouter } from "./routes/health.js";
import { ensurePdfBrowser, shutdownPdf } from "./services/pdfService.js";

const app = express();

// Trust the proxy so req.ip is correct on Railway (X-Forwarded-For).
app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(defaultLimiter);

// Static: uploads + cached PDFs (served from the volume).
app.use("/uploads", express.static(path.join(env.DATA_DIR, "uploads"), { fallthrough: true }));
app.use("/pdfs", express.static(path.join(env.DATA_DIR, "pdfs"), { fallthrough: true }));

// API routes.
app.use("/api/health", healthRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/uploads", uploadsRouter);

// Internal render route (NOT under /api — Puppeteer hits this directly on 127.0.0.1).
app.use("/render", renderRouter);

// Root sanity ping.
app.get("/", (_req, res) => {
  res.json({
    name: "newsforge-api",
    version: "0.1.0",
    docs: "/api/health",
  });
});

app.use(errorHandler);

async function bootstrap(): Promise<void> {
  await fs.mkdir(path.join(env.DATA_DIR, "uploads"), { recursive: true });
  await fs.mkdir(path.join(env.DATA_DIR, "pdfs"), { recursive: true });

  // Warm Chromium during boot (Vitaly §5 R6). Don't fail boot if Chromium is unavailable
  // (local dev may not have a usable binary); log and continue.
  try {
    await ensurePdfBrowser();
    log.info("puppeteer_ready");
  } catch (e) {
    log.warn("puppeteer_warm_failed", { err: e instanceof Error ? e.message : String(e) });
  }

  const server = app.listen(env.PORT, () => {
    log.info("listening", { port: env.PORT, baseUrl: env.APP_BASE_URL });
  });

  const shutdown = async (sig: string) => {
    log.info("shutdown_begin", { sig });
    server.close();
    await shutdownPdf();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((e) => {
  log.error("bootstrap_failed", { err: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
