import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/home/tom/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome", args: ["--no-sandbox","--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 850, height: 1100, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(here, "specimen.html"), { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 600));
const count = await page.evaluate(() => document.querySelectorAll("#page-3 figure.photo").length);
for (let i = 0; i < count; i++) {
  const el = (await page.$$("#page-3 figure.photo"))[i];
  const img = await el.$("img");
  const meta = await page.evaluate((imgEl) => {
    const r = imgEl.getBoundingClientRect();
    return { src: imgEl.getAttribute("src"), nw: imgEl.naturalWidth, nh: imgEl.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height), complete: imgEl.complete };
  }, img);
  console.log(`figure[${i}]`, JSON.stringify(meta));
  await el.screenshot({ path: path.join(here, `p2fig-${i}.png`) });
}
await browser.close();
