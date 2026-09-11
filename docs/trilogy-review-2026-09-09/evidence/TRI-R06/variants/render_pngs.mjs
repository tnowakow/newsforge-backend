/* TRI-R06 variant proofs: html -> png (2448x1584 spread @144dpi).
 * Uses the same chromium binary as TRI-SPEC-2P render.mjs.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const names = ["sparse-editorial", "medium-panel", "dense-grid", "long-copy-feature", "photo-heavy"];

const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/home/tom/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 2448, height: 1584, deviceScaleFactor: 1 });
  for (const n of names) {
    const html = path.join(here, `${n}.html`);
    await page.goto(`file://${html}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(here, `${n}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 2448, height: 1584 } });
    console.log("wrote", out, fs.statSync(out).size, "bytes");
  }
} finally {
  await browser.close();
}
