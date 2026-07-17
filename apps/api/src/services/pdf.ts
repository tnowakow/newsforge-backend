/**
 * PDF generation — web + print variants (Vitaly §9).
 *
 * Web variant  : Letter, 8.5 × 11, no bleed. Unchanged from v1.
 * Print variant: 11.25 × 17.25 in (spread + 0.125" bleed), preferCSSPageSize,
 *                SVG crop marks injected by the render layer, 300 DPI hints
 *                on the render page. Persists to Run.printPdfPath.
 *
 * Cache invalidation: routes/runs.ts nulls both `pdfPath` and `printPdfPath`
 * on every mutation that bumps layoutVersion (Vitaly rule 6 + rule 15).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getPage } from "../browser.js";
import { env } from "../env.js";
import { prisma } from "../db.js";

export type PdfVariant = "web" | "print";

export interface PdfGenerationResult {
  pdfPath: string;
  pdfUrl: string;
  variant: PdfVariant;
}

export async function generatePdfForRun(
  runId: string,
  variant: PdfVariant = "web",
): Promise<PdfGenerationResult> {
  await fs.mkdir(env.PDF_DIR, { recursive: true });
  const filename = `${runId}-${variant}-${Date.now()}.pdf`;
  const fullPath = path.resolve(env.PDF_DIR, filename);

  const variantQs = variant === "print" ? "&variant=print" : "";
  const renderUrl =
    `http://127.0.0.1:${env.PORT}/render/${encodeURIComponent(runId)}` +
    `?key=${encodeURIComponent(env.INTERNAL_RENDER_KEY)}${variantQs}`;

  const page = await getPage();
  await page.goto(renderUrl, { waitUntil: "networkidle0", timeout: 30_000 });

  if (variant === "print") {
    await page.pdf({
      path: fullPath,
      // Vitaly §9.1 — 17.25 × 11.25 in LANDSCAPE (17×11 trim + 0.125" bleed
      // all sides). Width first. Phase 4 QA (Riley B1) confirmed axes were
      // swapped and pdfinfo reported 810×1242 pts (portrait) instead of the
      // required 1242×810 pts landscape spread.
      width: "17.25in",
      height: "11.25in",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } else {
    await page.pdf({
      path: fullPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: false,
    });
  }

  const relPath = path.relative(process.cwd(), fullPath);
  const pdfUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/pdfs/${filename}`;
  return { pdfPath: relPath, pdfUrl, variant };
}

/**
 * Convenience: render + persist both variants (used by /approve).
 * Runs sequentially to avoid contention on the shared Puppeteer page.
 */
export async function generatePdfPair(runId: string): Promise<{
  web: PdfGenerationResult;
  print: PdfGenerationResult;
}> {
  const web = await generatePdfForRun(runId, "web");
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: { pdfPath: web.pdfPath, pdfGeneratedAt: new Date() },
  });
  const print = await generatePdfForRun(runId, "print");
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: { printPdfPath: print.pdfPath, printPdfGeneratedAt: new Date() },
  });
  return { web, print };
}

/**
 * Invalidate cached PDFs (both variants) for a run. Deletes files best-effort
 * and clears the DB pointers. Safe to call on every mutation.
 */
export async function invalidatePdfCache(runId: string): Promise<void> {
  const run = await prisma.newsletterRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const paths = [run.pdfPath, run.printPdfPath].filter(
    (p): p is string => !!p,
  );
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.unlink(path.resolve(process.cwd(), p));
      } catch {
        // Missing file is fine — cache-only invalidation.
      }
    }),
  );
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: {
      pdfPath: null,
      pdfGeneratedAt: null,
      printPdfPath: null,
      printPdfGeneratedAt: null,
    },
  });
}
