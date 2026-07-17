/**
 * Persistent Puppeteer browser. We boot ONE browser instance at server start
 * and reuse ONE page across requests. Cold start cost is absorbed at boot,
 * not at the first PDF request.
 *
 * In dev (no Lambda) we try a locally installed Chromium first (via PUPPETEER_EXECUTABLE_PATH),
 * falling back to @sparticuz/chromium which works in serverless/container envs.
 */
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

let browser: Browser | null = null;
let page: Page | null = null;
let bootPromise: Promise<void> | null = null;

async function bootInner(): Promise<void> {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH ||
    (await chromium.executablePath());

  const args = [
    ...chromium.args,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ];

  browser = await puppeteer.launch({
    args,
    executablePath,
    headless: true,
    defaultViewport: { width: 1240, height: 1754 }, // ~A4 @ 150dpi
  });

  page = await browser.newPage();
  // Handle the browser crashing — we'll re-boot on next call.
  browser.on("disconnected", () => {
    browser = null;
    page = null;
    bootPromise = null;
  });
}

export function bootBrowser(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = bootInner().catch((err) => {
    console.error("[browser] boot failed:", err);
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

export async function getPage(): Promise<Page> {
  if (!browser || !page) {
    await bootBrowser();
  }
  if (!page) throw new Error("Puppeteer page failed to initialize");
  return page;
}

export async function shutdownBrowser(): Promise<void> {
  try {
    if (browser) await browser.close();
  } catch (err) {
    console.error("[browser] shutdown error:", err);
  } finally {
    browser = null;
    page = null;
    bootPromise = null;
  }
}
