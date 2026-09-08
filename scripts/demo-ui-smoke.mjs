#!/usr/bin/env node
/**
 * Narrow, credential-free smoke check for the real-upload demo surface.
 * Browser authentication and file upload are intentionally not automated here;
 * --run-id verifies the authoritative preview response after an operator login.
 */
import fs from "node:fs/promises";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/demo-ui-smoke.mjs --base-url URL --manifest FILE [--run-id ID]");
  process.exit(0);
}

const baseUrl = arg("--base-url");
const manifestPath = arg("--manifest");
if (!baseUrl || !manifestPath) {
  console.error("Required: --base-url URL --manifest FILE");
  process.exit(2);
}

const manifest = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8"));
if (!Array.isArray(manifest.packets) || manifest.packets.length === 0) {
  throw new Error("manifest contains no packets");
}
for (const packet of manifest.packets) {
  if (!packet.docx || !Array.isArray(packet.images)) throw new Error(`invalid packet: ${packet.name ?? "unnamed"}`);
}

const base = baseUrl.replace(/\/$/, "");
const health = await fetch(`${base}/healthz`);
if (!health.ok) throw new Error(`healthz returned ${health.status}`);
console.log(`healthz: ${health.status}`);
console.log(`manifest: ${manifest.packets.length} packet(s) validated`);

const runId = arg("--run-id");
if (!runId) {
  console.log("preview: not checked (provide --run-id after authorized login)");
  process.exit(0);
}
const preview = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/preview-html?variant=print`);
const csp = preview.headers.get("content-security-policy") ?? "";
if (!preview.ok) throw new Error(`preview returned ${preview.status}`);
if (!csp.includes("frame-ancestors 'self'") || !csp.includes("default-src 'none'")) {
  throw new Error("preview CSP is missing iframe isolation directives");
}
const html = await preview.text();
if (!html.includes("@page") || html.length < 500) throw new Error("preview HTML is not a rendered document");
console.log(`preview: ${preview.status}, CSP isolation verified, ${html.length} bytes`);
