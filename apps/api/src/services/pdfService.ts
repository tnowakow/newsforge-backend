import fs from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import sparticuzChromium from "@sparticuz/chromium";
import { env } from "../env.js";
import { log } from "../logger.js";
import { prisma } from "../db.js";

/** Vitaly §6.2: one browser, one page, reused. No per-request spawns. */
let browser: Browser | null = null;
let page: Page | null = null;
let initPromise: Promise<void> | null = null;
let lastRenderMs = 0;

async function init(): Promise<void> {
  if (browser && page && !page.isClosed()) return;
  const executablePath =
    env.PUPPETEER_EXECUTABLE_PATH && env.PUPPETEER_EXECUTABLE_PATH.length > 0
      ? env.PUPPETEER_EXECUTABLE_PATH
      : await sparticuzChromium.executablePath();
  const args = [
    ...sparticuzChromium.args,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
  ];
  log.info("puppeteer_launch", { executablePath, argsCount: args.length });
  browser = await puppeteer.launch({
    args,
    executablePath,
    headless: true,
  });
  page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
}

export async function ensurePdfBrowser(): Promise<void> {
  if (!initPromise) initPromise = init().catch((e) => {
    initPromise = null;
    throw e;
  });
  await initPromise;
}

export function pdfHealth(): { ready: boolean; lastRenderMs: number } {
  return { ready: !!browser && !!page && !page.isClosed(), lastRenderMs };
}

export async function renderRunToPdf(runId: string): Promise<{ pdfPath: string; ms: number }> {
  await ensurePdfBrowser();
  if (!page) throw new Error("PDF page not available");

  // Cache hit? (Vitaly §6.6)
  const run = await prisma.newsletterRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (
    run.pdfPath &&
    run.pdfGeneratedAt &&
    run.pdfGeneratedAt.getTime() >= run.updatedAt.getTime()
  ) {
    try {
      await fs.access(run.pdfPath);
      return { pdfPath: run.pdfPath, ms: 0 };
    } catch {
      // fall through, file missing — regenerate.
    }
  }

  const url = `http://127.0.0.1:${env.PORT}/render/${runId}`;
  const t0 = Date.now();
  await page.setExtraHTTPHeaders({ "x-internal-render-secret": env.INTERNAL_RENDER_SECRET });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 15_000 });
  // Browser-context script — string body so we don't need DOM types in the API's tsconfig.
  await page.evaluate(`(async () => {
    try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch (e) {}
    await new Promise((resolve) => {
      var tries = 0;
      var step = function () {
        if (window.__NEWSFORGE_READY__ === true || tries++ > 200) return resolve();
        setTimeout(step, 50);
      };
      step();
    });
  })()`);
  const buffer = await page.pdf({
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const pdfDir = path.join(env.DATA_DIR, "pdfs");
  await fs.mkdir(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${runId}.pdf`);
  await fs.writeFile(pdfPath, buffer);

  const ms = Date.now() - t0;
  lastRenderMs = ms;
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: { pdfPath, pdfGeneratedAt: new Date() },
  });
  log.info("pdf_render_ok", { runId, ms });
  return { pdfPath, ms };
}

export async function shutdownPdf(): Promise<void> {
  try {
    if (page) await page.close();
  } catch {}
  try {
    if (browser) await browser.close();
  } catch {}
  page = null;
  browser = null;
  initPromise = null;
}
