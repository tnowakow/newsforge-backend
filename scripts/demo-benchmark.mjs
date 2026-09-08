#!/usr/bin/env node
/**
 * Source-paired NewsForge benchmark runner.
 *
 * This intentionally does not reuse porter-five-packet-cycle.mjs: every packet
 * owns its source files, expected ledger, and reference PDF. A failed quality
 * gate is a failed baseline unless --force is explicitly used for diagnostics.
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const HELP = `Usage: node scripts/demo-benchmark.mjs [options]

Required:
  --manifest <path>    Source-paired fixture manifest JSON
  --base-url <url>     Explicit NewsForge API base URL
  --client-id <id>     Explicit client id
  --month <label>      Newsletter month label, e.g. "July 2026"
  --out <dir>          New, empty output directory

Optional:
  --force               Diagnostic-only retry after a 409 quality gate
  --help                Show this help

The runner is sequential. It never substitutes an archived PDF or silently
turns a 409 into an acceptance result.`;

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "force" || key === "help") result[key] = true;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) result[key] = argv[++i];
    else throw new Error(`Missing value for --${key}`);
  }
  return result;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function sha256(file) {
  const hash = createHash("sha256");
  return new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${response.status} ${url}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function unwrapRun(value) {
  let run = value;
  while (run?.run && !run.id) run = run.run;
  if (!run?.id) throw new Error("Run response did not contain an id");
  return run;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function validateManifest(manifest, manifestPath) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.packets) || manifest.packets.length === 0) {
    errors.push("manifest.packets must contain at least one packet");
    return errors;
  }
  const names = new Set();
  for (const [index, packet] of manifest.packets.entries()) {
    const label = `packet[${index}]`;
    if (!packet.name || names.has(packet.name)) errors.push(`${label}: missing or duplicate name`);
    names.add(packet.name);
    for (const field of ["docx", "docx_sha256", "reference_pdf"]) {
      if (!packet[field]) errors.push(`${label}: missing ${field}`);
    }
    if (!Array.isArray(packet.images)) errors.push(`${label}: images must be an array`);
    const imageIds = new Set();
    for (const [imageIndex, image] of (packet.images ?? []).entries()) {
      if (!image.id || imageIds.has(image.id)) errors.push(`${label}.images[${imageIndex}]: missing or duplicate image id`);
      imageIds.add(image.id);
      if (!image.path || !image.sha256) errors.push(`${label}.images[${imageIndex}]: missing path or sha256`);
    }
    if (!Array.isArray(packet.sourceLedger) || packet.sourceLedger.length === 0) {
      errors.push(`${label}: sourceLedger is required and cannot be empty`);
    }
    for (const item of packet.sourceLedger ?? []) {
      if (!item.id || !item.kind || typeof item.originalText !== "string") {
        errors.push(`${label}.sourceLedger: every entry needs id, kind, originalText`);
      }
    }
    for (const [field, value] of [["docx", packet.docx], ["reference_pdf", packet.reference_pdf]]) {
      if (!(await exists(value))) errors.push(`${label}: ${field} does not exist: ${value}`);
    }
    if (await exists(packet.docx) && packet.docx_sha256 !== await sha256(packet.docx)) {
      errors.push(`${label}: DOCX sha256 mismatch: ${packet.docx}`);
    }
    if (await exists(packet.reference_pdf) && packet.reference_sha256 && packet.reference_sha256 !== await sha256(packet.reference_pdf)) {
      errors.push(`${label}: reference sha256 mismatch: ${packet.reference_pdf}`);
    }
    for (const image of packet.images ?? []) {
      if (!(await exists(image.path))) errors.push(`${label}: image does not exist: ${image.path}`);
      else if (image.sha256 !== await sha256(image.path)) errors.push(`${label}: image sha256 mismatch: ${image.path}`);
    }
  }
  if (!manifestPath) errors.push("manifest path is required");
  return errors;
}

async function saveFailure(out, reason, detail = {}) {
  await fs.mkdir(out, { recursive: true });
  await writeJson(path.join(out, "acceptance-failure.json"), {
    acceptanceEligible: false,
    reason,
    ...detail,
    recordedAt: new Date().toISOString(),
  });
}

async function uploadPacket(baseUrl, clientId, packet) {
  const form = new FormData();
  const docxName = path.basename(packet.docx);
  form.append("files", new Blob([await fs.readFile(packet.docx)]), docxName);
  for (const image of packet.images) {
    form.append("files", new Blob([await fs.readFile(image.path)]), image.id);
  }
  form.append("clientId", clientId);
  return jsonFetch(`${baseUrl}/api/uploads`, { method: "POST", body: form });
}

function articlesFromUpload(upload) {
  return (upload.created ?? []).filter((asset) => asset.type === "ARTICLE").flatMap((asset, assetIndex) => {
    const parsed = asset.meta?.porterParse?.parsedArticles;
    const values = Array.isArray(parsed) && parsed.length ? parsed : [{ title: asset.meta?.originalFilename ?? `Uploaded article ${assetIndex + 1}`, body: asset.contentOrUrl ?? "" }];
    return values.map((article, index) => ({
      id: article.id ?? `${asset.id}-article-${index}`,
      title: article.title ?? `Uploaded article ${index + 1}`,
      body: article.body ?? "",
      wordCount: article.wordCount ?? String(article.body ?? "").trim().split(/\s+/).filter(Boolean).length,
      ...(article.byline ? { byline: article.byline } : {}),
      ...(article.sectionId ? { sectionId: article.sectionId } : {}),
      imageRefs: Array.isArray(article.imageRefs) ? article.imageRefs : [],
      ...(article.articleType ? { articleType: article.articleType } : {}),
      source: "UPLOAD",
    }));
  });
}

function imagesFromUpload(upload) {
  return (upload.created ?? []).filter((asset) => asset.type === "IMAGE").map((asset) => ({
    id: asset.id, url: asset.contentOrUrl, alt: asset.meta?.originalFilename,
    source: "UPLOAD", isPlaceholder: false, width: asset.meta?.width, height: asset.meta?.height,
    aspect: asset.meta?.width > asset.meta?.height ? "landscape" : asset.meta?.width < asset.meta?.height ? "portrait" : "square",
  }));
}

async function rasterPair(pdfPath, referencePath, outDir, prefix) {
  await runCommand("pdftoppm", ["-png", "-r", "110", pdfPath, path.join(outDir, `${prefix}-generated`)]);
  await runCommand("pdftoppm", ["-png", "-r", "110", referencePath, path.join(outDir, `${prefix}-reference`)]);
}

async function runPacket({ baseUrl, clientId, month, packet, out, force }) {
  const packetOut = path.join(out, packet.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  await fs.mkdir(packetOut, { recursive: true });
  await writeJson(path.join(packetOut, "source-ledger.json"), {
    packet: packet.name, docx: packet.docx, referencePdf: packet.reference_pdf,
    pdfPageMapping: packet.pdfPageMapping, entries: packet.sourceLedger,
  });
  const request = { clientId, monthLabel: month, fillerMode: "PLACEHOLDER", packet: packet.name, sourceDocx: packet.docx, sourceImageIds: packet.images.map((image) => image.id) };
  await writeJson(path.join(packetOut, "request.json"), request);
  const upload = await uploadPacket(baseUrl, clientId, packet);
  await writeJson(path.join(packetOut, "upload.json"), upload);
  const articles = articlesFromUpload(upload);
  const images = imagesFromUpload(upload);
  const runRequest = { clientId, monthLabel: month, fillerMode: "PLACEHOLDER", articles, images };
  await writeJson(path.join(packetOut, "generation-request.json"), runRequest);
  const run = unwrapRun(await jsonFetch(`${baseUrl}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(runRequest) }));
  await writeJson(path.join(packetOut, "run.json"), run);
  const generationPath = { upload: "/api/uploads", run: "/api/runs", runId: run.id, pdf: `/api/runs/${run.id}/pdf?variant=web` };
  await writeJson(path.join(packetOut, "generation-path.json"), generationPath);

  let forced = false;
  let pdf;
  try {
    pdf = await jsonFetch(`${baseUrl}/api/runs/${run.id}/pdf?variant=web`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  } catch (error) {
    if (error.status !== 409) throw error;
    await saveFailure(packetOut, "quality_gate_blocked", { packet: packet.name, runId: run.id, status: 409, response: error.body, forceRequested: force });
    if (!force) return { packet: packet.name, runId: run.id, acceptanceEligible: false, forced: false, status: "blocked-409" };
    forced = true;
    pdf = await jsonFetch(`${baseUrl}/api/runs/${run.id}/pdf?variant=web&force=1`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  }
  await writeJson(path.join(packetOut, "pdf-response.json"), pdf);
  if (!pdf.pdfUrl) throw new Error("PDF response did not contain pdfUrl");
  const pdfResponse = await fetch(pdf.pdfUrl);
  if (!pdfResponse.ok) throw new Error(`PDF download ${pdfResponse.status}: ${pdf.pdfUrl}`);
  const pdfPath = path.join(packetOut, "baseline.pdf");
  await fs.writeFile(pdfPath, Buffer.from(await pdfResponse.arrayBuffer()));
  await rasterPair(pdfPath, packet.reference_pdf, packetOut, "inside");
  const result = { packet: packet.name, runId: run.id, templateId: run.templateId, pdfUrl: pdf.pdfUrl, forced, acceptanceEligible: !forced, qualityGate: run.layoutFitReport?.qualityGate ?? null, status: forced ? "diagnostic-forced" : "accepted" };
  await writeJson(path.join(packetOut, "result.json"), result);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  for (const key of ["manifest", "base-url", "client-id", "month", "out"]) if (!args[key]) throw new Error(`Missing required --${key}\n\n${HELP}`);
  const out = path.resolve(args.out);
  if (await exists(out)) {
    const entries = await fs.readdir(out);
    if (entries.length) throw new Error(`Output directory collision: ${out} is not empty`);
  } else await fs.mkdir(out, { recursive: true });
  const manifest = await readJson(args.manifest);
  const validationErrors = await validateManifest(manifest, args.manifest);
  await writeJson(path.join(out, "manifest-validation.json"), { manifest: path.resolve(args.manifest), errors: validationErrors, valid: validationErrors.length === 0 });
  if (validationErrors.length) {
    await saveFailure(out, "fixture_validation_failed", { errors: validationErrors });
    throw new Error(`Fixture validation failed (${validationErrors.length} errors); see ${path.join(out, "manifest-validation.json")}`);
  }
  const results = [];
  for (const packet of manifest.packets) {
    try {
      results.push(await runPacket({ baseUrl: cleanBaseUrl(args["base-url"]), clientId: args["client-id"], month: args.month, packet, out, force: Boolean(args.force) }));
    } catch (error) {
      const failure = { packet: packet.name, message: error.message, status: error.status, response: error.body };
      await writeJson(path.join(out, `${packet.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-error.json`), failure);
      results.push({ packet: packet.name, acceptanceEligible: false, status: "error", error: error.message });
    }
  }
  const summary = { manifest: path.resolve(args.manifest), baseUrl: cleanBaseUrl(args["base-url"]), month: args.month, packetCountExpected: manifest.packets.length, packetCountObserved: results.length, acceptanceEligible: results.length === manifest.packets.length && results.every((item) => item.acceptanceEligible === true), results };
  await writeJson(path.join(out, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.acceptanceEligible) process.exitCode = 2;
}

main().catch(async (error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
