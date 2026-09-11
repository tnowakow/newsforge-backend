import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({
  headless: true,
  executablePath: "/home/tom/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
  await page.goto(`file://${path.resolve(here, "specimen.html")}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(async () => { await document.fonts.ready; for (const i of document.images) { await i.decode().catch(()=>{}); } });
  const figs = await page.$$("figure.photo");
  const names = ["ed-photo3","legacy-photo2","oaks-photo7"];
  // page-2 figures are index 0,1,2
  for (let i = 0; i < Math.min(3, figs.length); i++) {
    const el = await figs[i].boundingBox();
    await figs[i].screenshot({ path: path.resolve(here, `fig-${names[i]}.png`) });
    console.log(names[i], "box=", JSON.stringify(el));
  }
  // dump computed natural + rendered sizes
  const info = await page.evaluate(() => Array.from(document.querySelectorAll("#page-2 figure.photo img")).map(img => ({
    src: img.currentSrc.split("/").pop(), complete: img.complete,
    nw: img.naturalWidth, nh: img.naturalHeight,
    rw: Math.round(img.getBoundingClientRect().width), rh: Math.round(img.getBoundingClientRect().height),
    objectFit: getComputedStyle(img).objectFit,
    frameH: getComputedStyle(img.parentElement).height,
  })));
  console.log(JSON.stringify(info, null, 1));
} finally { await browser.close(); }
