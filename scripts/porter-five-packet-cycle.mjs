import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const base = process.env.NEWSFORGE_API ?? "https://api-production-26a0.up.railway.app";
const clientId = "cf9d5c48ad3397d431d1e6cd";
const packetDir = process.argv[2];
const outputDir = process.argv[3];
const photoDir = process.argv[4];
if (!packetDir || !outputDir || !photoDir) throw new Error("usage: node script packet-dir output-dir photo-dir");
await fs.mkdir(outputDir, { recursive: true });

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw Object.assign(new Error(`${response.status} ${url}: ${text}`), { status: response.status, body });
  return body;
}

function articleFrom(asset, article, index) {
  return {
    id: article.id ?? `${asset.id}-article-${index}`,
    title: article.title ?? `Uploaded article ${index + 1}`,
    body: article.body ?? "",
    wordCount: article.wordCount ?? String(article.body ?? "").trim().split(/\s+/).filter(Boolean).length,
    ...(article.byline ? { byline: article.byline } : {}),
    ...(article.sectionId ? { sectionId: article.sectionId } : {}),
    imageRefs: Array.isArray(article.imageRefs) ? article.imageRefs : [],
    ...(article.articleType ? { articleType: article.articleType } : {}),
    source: "UPLOAD",
  };
}

function raster(pdf, prefix) {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftoppm", ["-png", "-r", "110", pdf, prefix], { stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pdftoppm ${code}`)));
  });
}

const packets = (await fs.readdir(packetDir)).filter((name) => name.endsWith(".docx")).sort();
const photos = (await fs.readdir(photoDir)).filter((name) => /^photo[1-5]\.jpg$/.test(name)).sort();
const summary = [];
for (let index = 0; index < packets.length; index++) {
  if (index + 2 < Number(process.env.START_PACKET ?? 2)) continue;
  if (index + 2 > Number(process.env.END_PACKET ?? 6)) continue;
  const packet = packets[index];
  const form = new FormData();
  const packetBytes = await fs.readFile(path.join(packetDir, packet));
  form.append("files", new Blob([packetBytes]), packet.replace(/---.+(?=\.docx$)/, ""));
  for (const photo of photos) {
    const bytes = await fs.readFile(path.join(photoDir, photo));
    form.append("files", new Blob([bytes]), photo);
  }
  form.append("clientId", clientId);
  const upload = await jsonFetch(`${base}/api/uploads`, { method: "POST", body: form });
  await fs.writeFile(path.join(outputDir, `packet-${index + 2}-upload.json`), JSON.stringify(upload, null, 2));
  const articleAssets = upload.created.filter((asset) => asset.type === "ARTICLE");
  const articles = articleAssets.flatMap((asset) => {
    const parsed = asset.meta?.porterParse?.parsedArticles;
    return Array.isArray(parsed) && parsed.length
      ? parsed.map((article, i) => articleFrom(asset, article, i))
      : [articleFrom(asset, { title: asset.meta?.originalFilename ?? "Uploaded article", body: asset.contentOrUrl }, 0)];
  });
  const images = upload.created.filter((asset) => asset.type === "IMAGE").map((asset) => ({
    id: asset.id, url: asset.contentOrUrl, alt: asset.meta?.originalFilename,
    source: "UPLOAD", isPlaceholder: false,
    width: asset.meta?.width, height: asset.meta?.height,
    aspect: asset.meta?.width > asset.meta?.height ? "landscape" : asset.meta?.width < asset.meta?.height ? "portrait" : "square",
  }));
  let runResponse;
  try {
    runResponse = await jsonFetch(`${base}/api/runs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, monthLabel: "July 2026", fillerMode: "PLACEHOLDER", articles, images }),
    });
  } catch (error) {
    const detail = { packet: index + 2, message: error.message, status: error.status, body: error.body };
    await fs.writeFile(path.join(outputDir, `packet-${index + 2}-error.json`), JSON.stringify(detail, null, 2));
    process.stderr.write(`${JSON.stringify(detail)}\n`);
    continue;
  }
  let run = runResponse;
  while (run && typeof run === "object" && run.run && !run.id) run = run.run;
  await fs.writeFile(path.join(outputDir, `packet-${index + 2}-run.json`), JSON.stringify(run, null, 2));
  let pdf;
  let forced = false;
  try {
    pdf = await jsonFetch(`${base}/api/runs/${run.id}/pdf?variant=web`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  } catch (error) {
    if (error.status !== 409) throw error;
    forced = true;
    pdf = await jsonFetch(`${base}/api/runs/${run.id}/pdf?variant=web&force=1`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  }
  await fs.writeFile(path.join(outputDir, `packet-${index + 2}-pdf.json`), JSON.stringify(pdf, null, 2));
  const pdfResponse = await fetch(pdf.pdfUrl);
  if (!pdfResponse.ok) throw new Error(`PDF download ${pdfResponse.status}`);
  const pdfPath = path.join(outputDir, `packet-${index + 2}.pdf`);
  await fs.writeFile(pdfPath, Buffer.from(await pdfResponse.arrayBuffer()));
  await raster(pdfPath, path.join(outputDir, `packet-${index + 2}-page`));
  const report = run.layoutFitReport ?? {};
  summary.push({ packet: index + 2, runId: run.id, templateId: run.templateId, score: report.fullOutputScore ?? report.score, forced, pdfUrl: pdf.pdfUrl, qualityGate: report.qualityGate, playbook: report.porterLayoutPlaybook?.summary, invariants: report.porterLayoutInvariants });
  await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary.at(-1))}\n`);
}
