/* TRI-SPEC-2P render: specimen.html -> specimen.pdf
 * Mirrors apps/api/src/services/pdf.ts: document.fonts.ready,
 * Font Loading API check for each required family, computed body
 * font-family check, image decode, then page.pdf (Letter).
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(here, "specimen.html");
const outPath = path.resolve(here, "specimen.pdf");

// Contract values — must match packages/shared/renderContract.ts (letter-inner-v1).
const CONTRACT = {
  required: ["EB Garamond", "Source Sans 3"],
  expectedBody: "EB Garamond",
  expectedDisplay: "Source Sans 3",
};

const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/home/tom/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 60000 });

  const inspection = await page.evaluate(async (contract) => {
    const doc = document;
    await doc.fonts.ready;
    const result = {
      required: {},
      computed: {},
      images: [],
      fontFaces: [],
    };
    for (const family of contract.required) {
      result.required[family] = doc.fonts.check(`10pt "${family}"`);
    }
    result.computed.body = doc.defaultView.getComputedStyle(doc.body).fontFamily;
    const kick = doc.querySelector(".kicker");
    result.computed.kicker = kick ? doc.defaultView.getComputedStyle(kick).fontFamily : null;
    for (const img of Array.from(doc.images)) {
      let ok = false;
      try { ok = await img.decode().catch(() => false); } catch { ok = false; }
      result.images.push({ src: img.currentSrc.split("/").pop(), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, decoded: ok });
    }
    for (const face of doc.fonts) {
      result.fontFaces.push({ family: face.family, status: face.status, weight: face.weight });
    }
    // layout overflow check per page (no clipped ending)
    result.overflow = Array.from(doc.querySelectorAll(".page")).map((p, i) => {
      const r = p.getBoundingClientRect();
      const cr = doc.createRange();
      cr.selectNodeContents(p);
      const rect = cr.getBoundingClientRect();
      return { page: i + 1, pageBottom: Math.round(r.bottom), contentBottom: Math.round(rect.bottom), fits: rect.bottom <= r.bottom + 1 };
    });
    return result;
  }, CONTRACT);

  // Hard-fail like pdf.ts: required families must load.
  for (const [family, loaded] of Object.entries(inspection.required)) {
    if (!loaded) throw new Error(`render contract font unavailable: ${family}`);
  }
  if (!inspection.computed.body.includes(CONTRACT.expectedBody)) {
    throw new Error(`render contract body font mismatch: expected "${CONTRACT.expectedBody}" in "${inspection.computed.body}"`);
  }

  await page.pdf({
    path: outPath,
    format: "Letter",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const shots = [];
  const pages = await page.$$(".page");
  for (let i = 0; i < pages.length; i++) {
    const p = path.resolve(here, `page-${i + 1}.png`);
    await pages[i].screenshot({ path: p });
    shots.push(p);
  }

  fs.writeFileSync(path.resolve(here, "font-inspection.json"), JSON.stringify({
    contractId: "letter-inner-v1 (packages/shared/renderContract.ts)",
    checkedAt: new Date().toISOString(),
    ...inspection,
    verdict: {
      requiredFamiliesLoaded: Object.values(inspection.required).every(Boolean),
      bodyFontResolved: inspection.computed.body.includes(CONTRACT.expectedBody),
      allImagesLoaded: inspection.images.every((im) => im.complete && im.naturalWidth > 0),
      noOverflow: inspection.overflow.every((o) => o.fits),
    },
  }, null, 2));

  console.log(JSON.stringify({ outPath, shots, inspection: { required: inspection.required, computed: inspection.computed, images: inspection.images.length, overflow: inspection.overflow } }, null, 2));
} finally {
  await browser.close();
}
