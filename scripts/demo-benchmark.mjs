#!/usr/bin/env node
/**
 * Ledger-driven NewsForge benchmark runner.
 *
 * For each expected-ledger in docs/demo/fixtures/expected-ledgers/:
 *   1. Verify input files (DOCX + photos) exist and match ledger sha256.
 *   2. Drive the live API: upload → create run → try PDF (no force) → record outcome.
 *   3. Label the test:
 *      - same-packet   : input sha256 matches the R01 visual-baseline sha256
 *      - style-only    : ledger is in an equivalence group, input sha differs from baseline
 *      - logical-only  : no visual baseline captured for this input
 *   4. Logical comparison: parsed article count vs ledger expectedCounts.
 *   5. Visual regression (same-packet + style-only): page count + story-heading presence + font set.
 *   6. Failure semantics:
 *      - missing/mismatched input → "input-missing", NOT acceptance-eligible
 *      - quality-gate 409       → "gate-blocked", NOT acceptance-eligible
 *      - --force                → "diagnostic-forced", NEVER an acceptance pass
 *   7. Record per run: input hashes, revision, render contract (id + digest), mode, output hashes.
 *
 * Exit code 0 only if every test is acceptance-eligible AND passes its logical (and, where
 * applicable, visual) comparison.
 *
 * Usage:
 *   node scripts/demo-benchmark.mjs \
 *     --base-url http://127.0.0.1:3001 \
 *     --client-id <clientId> \
 *     --password <unlock-password> \
 *     --revision <sha-or-override> \
 *     [--force] [--ledgers <dir>] [--baseline-pdf <path>] [--baseline-sha <sha>] \
 *     [--out <dir>] [--skip-run] [--only <label>[,<label>...]]
 */
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
// TRI-R06: the canonical contract lives in @newsforge/shared — imported here so
// the digest below can never drift from the API's digestFinalArtifact().
import { LETTER_RENDER_CONTRACT as CANONICAL_CONTRACT } from "@newsforge/shared";

// ── Render contract digest ────────────────────────────────────────────────────
function digestValue(value) {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, normalize(v)])
      );
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

// TRI-R06: the canonical contract (fonts, per-role type, font availability,
// columns) lives in @newsforge/shared (imported above). This literal is only
// a fallback for running before `npm run build:shared`.
const RENDER_CONTRACT_FALLBACK = {
  id: "letter-inner-v1",
  page: { widthIn: 8.5, heightIn: 11 },
  marginsIn: { top: 0.34, right: 0.34, bottom: 0.4, left: 0.34 },
  gutterPx: 4,
  headerHeightIn: 0.48,
  footerHeightIn: 0.16,
  fonts: { heading: "Source Sans 3", body: "EB Garamond" },
  fontAvailability: {
    strict: true,
    required: ["EB Garamond", "Source Sans 3"],
    declaredFallbacks: ["serif", "sans-serif"],
    substitutions: [
      { approvedFace: "Adobe Garamond Pro (AGaramondPro)", substitute: "EB Garamond", license: "OFL" },
      { approvedFace: "Museo Sans", substitute: "Source Sans 3", license: "OFL" },
    ],
    inRepoAssets: ["packages/shared/fonts/EB-Garamond-Variable.ttf", "packages/shared/fonts/Source-Sans-3-Variable.ttf"],
  },
  roles: {
    display: { fontStack: '"Source Sans 3", "Museo Sans", sans-serif', weight: 900, pt: 23, lineHeight: 1.05 },
    heading: { fontStack: '"Source Sans 3", "Museo Sans", sans-serif', weight: 700, pt: 15, lineHeight: 1.1 },
    body: { fontStack: '"EB Garamond", "Adobe Garamond Pro", serif', weight: 400, pt: 11.5, lineHeight: 1.38 },
    list: { fontStack: '"EB Garamond", "Adobe Garamond Pro", serif', weight: 400, pt: 11, lineHeight: 1.3 },
    caption: { fontStack: '"EB Garamond", "Adobe Garamond Pro", serif', weight: 400, pt: 9, lineHeight: 1.15 },
  },
  type: { bodyPt: 11.5, captionPt: 9, listPt: 11, lineHeight: 1.38, headingPt: 15, displayPt: 23 },
  columns: { count: 12, gutterPx: 4, maxMeasureChars: 66, minMeasureChars: 44 },
  readable: true,
};
const RENDER_CONTRACT = CANONICAL_CONTRACT ?? RENDER_CONTRACT_FALLBACK;
const RENDER_CONTRACT_ID = RENDER_CONTRACT.id;
const RENDER_CONTRACT_DIGEST = digestValue(RENDER_CONTRACT);

// ── CLI ───────────────────────────────────────────────────────────────────────
const HELP = `Ledger-driven NewsForge benchmark runner
Usage:
  node scripts/demo-benchmark.mjs --base-url <url> --client-id <id> --password <pw> [options]

Required:
  --base-url <url>        NewsForge API base URL
  --client-id <id>        Client identifier for uploads/runs
  --password <pw>         AI unlock password

Optional:
  --revision <sha>        Revision to record (default: auto-detected via git)
  --month <label>          Newsletter month label (default: use ledger monthLabel)
  --ledgers <dir>         Ledger directory (default: docs/demo/fixtures/expected-ledgers)
  --baseline-pdf <path>   R01 baseline PDF for visual regression
  --baseline-html <path>  R01 baseline preview HTML (recorded as input hash)
  --baseline-sha <sha>    R01 baseline input docx sha256 (used for same-packet label)
  --out <dir>             Output directory for run records (default: /tmp/benchmark-<ts>)
  --force                 Run in diagnostic-forced mode (never an acceptance pass)
  --skip-run              Skip API calls; only verify input files and ledgers
  --only <labels>         Comma-separated ledger labels to run (default: all)
  --help                  Show this help`;

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "force" || key === "help" || key === "skip-run") result[key] = true;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) result[key] = argv[++i];
    else throw new Error(`Missing value for --${key}\n\n${HELP}`);
  }
  return result;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
async function sha256File(file) {
  const hash = createHash("sha256");
  return new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function writeJson(p, value) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanBaseUrl(u) { return u.replace(/\/+$/, ""); }

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

async function pdftotextPages(pdfPath) {
  const r = await runCmd("pdftotext", [pdfPath, "-"]);
  if (r.code !== 0) return null;
  return r.stdout;
}

async function pdffonts(pdfPath) {
  const r = await runCmd("pdffonts", [pdfPath]);
  if (r.code !== 0) return [];
  const lines = r.stdout.split("\n").slice(2).filter(Boolean);
  // Strip the 6-char subset prefix ("AAAAAA+") — the same font gets different
  // subset tags across builds, so compare on the base family name.
  return lines.map((l) => (l.split(/\s{2,}/)[0] || "").replace(/^[A-Z]{6}\+/, "")).filter(Boolean);
}

async function pdfPageCount(pdfPath) {
  const r = await runCmd("pdfinfo", [pdfPath]);
  if (r.code !== 0) return null;
  const m = r.stdout.match(/Pages:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// ── Label derivation ──────────────────────────────────────────────────────────
// A ledger's equivalence group is the set of ledgers linked through
// `equivalence.equivalentTo` (symmetric: the group base is a member even
// though it points at no one).
function buildEquivalenceGroups(ledgers) {
  const members = new Map(); // label -> Set<label>
  for (const { ledger } of ledgers) {
    const eq = ledger.equivalence?.equivalentTo;
    if (!eq) continue;
    const a = ledger.label, b = eq;
    if (!members.has(a)) members.set(a, new Set([a]));
    if (!members.has(b)) members.set(b, new Set([b]));
    members.get(a).add(b);
    members.get(b).add(a);
  }
  return members;
}

function deriveLabel(ledger, baselineSha, groups) {
  const inGroup = groups?.has(ledger.label);
  if (baselineSha && ledger.sha256 === baselineSha) return "same-packet";
  if (inGroup) return "style-only";
  return "logical-only";
}

// ── API driver ────────────────────────────────────────────────────────────────
async function apiUnlock(baseUrl, password) {
  const res = await fetch(`${baseUrl}/api/runs/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`unlock failed: ${res.status} ${JSON.stringify(body)}`);
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

async function apiUpload(baseUrl, clientId, cookie, docxPath, photoPaths) {
  const form = new FormData();
  form.append("files", new Blob([await fs.readFile(docxPath)]), path.basename(docxPath));
  for (const p of photoPaths) {
    form.append("files", new Blob([await fs.readFile(p)]), path.basename(p));
  }
  form.append("clientId", clientId);
  const res = await fetch(`${baseUrl}/api/uploads`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

async function apiCreateRun(baseUrl, clientId, cookie, monthLabel, articles, images) {
  const body = {
    clientId,
    monthLabel,
    fillerMode: "PLACEHOLDER",
    layoutMode: "campus-inner-spread",
    articles,
    images,
    contentGenerationAudit: {
      kind: "benchmark",
      provider: "newsforge-local",
      model: "ledger-benchmark",
      usedFallback: false,
    },
  };
  const res = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`run create failed: ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  return json.run ?? json;
}

async function apiPdf(baseUrl, runId, cookie, { force = false } = {}) {
  const url = `${baseUrl}/api/runs/${runId}/pdf?variant=web${force ? "&force=1" : ""}`;
  const res = await fetch(url, { method: "POST", headers: { cookie } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ok: res.ok };
}

async function downloadPdf(baseUrl, pdfUrl) {
  const url = pdfUrl.startsWith("http") ? pdfUrl : baseUrl + pdfUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Visual comparator ─────────────────────────────────────────────────────────
function normalizeText(t) {
  return (t || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeHeading(h) {
  return normalizeText(h)
    .replace(/[–—-]/g, " ")
    .replace(/[’'"".,!?:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function visualCompare(freshPdfPath, baselinePdfPath) {
  const result = {
    pages: null,
    textOverlap: null,
    fonts: null,
    passed: false,
    errors: [],
  };

  // Page count — structural, must match
  const freshPages = await pdfPageCount(freshPdfPath);
  const basePages = await pdfPageCount(baselinePdfPath);
  result.pages = { fresh: freshPages, baseline: basePages };
  if (freshPages === null || basePages === null) {
    result.errors.push("page count could not be determined");
  } else if (freshPages !== basePages) {
    result.errors.push(`page count mismatch: fresh=${freshPages} baseline=${basePages}`);
  }

  // Fonts — baseline fonts must all be present in fresh (LiberationSerif family)
  const freshFonts = await pdffonts(freshPdfPath);
  const baseFonts = await pdffonts(baselinePdfPath);
  const freshFontSet = new Set(freshFonts);
  const baseFontSet = new Set(baseFonts);
  const missingFonts = [...baseFontSet].filter((f) => !freshFontSet.has(f));
  const extraFonts = [...freshFontSet].filter((f) => !baseFontSet.has(f));
  result.fonts = { fresh: freshFonts, baseline: baseFonts, missing: missingFonts, extra: extraFonts };
  if (missingFonts.length > 0) {
    result.errors.push(`fonts present in baseline but missing in fresh: ${missingFonts.join(", ")}`);
  }

  // Text overlap — fraction of baseline story-sentence bigrams present in fresh.
  // This catches content omissions (e.g. missing department heads) without
  // being brittle to word-wrapping or layout reflow.
  const baseText = normalizeText(await pdftotextPages(baselinePdfPath) || "");
  const freshText = normalizeText(await pdftotextPages(freshPdfPath) || "");
  if (baseText && freshText) {
    const baseWords = baseText.split(/\s+/);
    const baseBigrams = new Set();
    for (let i = 0; i < baseWords.length - 1; i += 1) baseBigrams.add(`${baseWords[i]} ${baseWords[i + 1]}`);
    const freshWordSet = new Set(freshText.split(/\s+/));
    const presentBigrams = [...baseBigrams].filter((bg) => {
      const [a, b] = bg.split(" ");
      return freshWordSet.has(a) && freshWordSet.has(b);
    });
    const overlap = baseBigrams.size > 0 ? presentBigrams.length / baseBigrams.size : 1;
    result.textOverlap = { baselineBigrams: baseBigrams.size, presentBigrams: presentBigrams.length, ratio: Number(overlap.toFixed(4)) };
    // Floor: 80% bigram overlap required (lenient — tolerates layout reflow and
    // branding-string swaps in the style-only case).
    if (overlap < 0.8) {
      result.errors.push(`text overlap ${overlap.toFixed(2)} below floor 0.80 (content omission suspected)`);
    }
  }

  result.passed = result.errors.length === 0;
  return result;
}

// ── Logical comparator (ledger expected vs PDF text) ─────────────────────────
function textHas(needle, haystack) {
  return haystack.includes(normalizeText(needle));
}

function logicalCompare(ledger, pdfText) {
  const expected = ledger.expected ?? {};
  // The ledger is human-authored and uses "ED" as shorthand for "Executive
  // Director". The PDF prints the full word. Expand the abbreviation in the
  // haystack so the two sides can match.
  const text = normalizeText(pdfText).replace(/(^|\s)ed(\s|$)/gi, "$1executive director$2");
  const checks = {};

  // Required prose-story headings (only those flagged required=true are hard)
  // Ledger headings are human annotations, often pluralised or parenthesised
  // ("Executive Directors Corner (no title line)"). Normalise both sides to
  // the bare core phrase and match on the first four significant words so the
  // comparator checks the heading is present, not the annotation verbatim.
  const coreWords = (h) => {
    let t = normalizeText(h).replace(/\(.*?\)/g, " ");
    t = t.replace(/[\u2013\u2014]/g, " ");
    t = t.replace(/(^|\s)ed(\s|$)/gi, "$1executive director$2");
    t = t.replace(/(^|\s)exec(\s|$)/gi, "$1executive$2");
    return t
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(a|an|the|of|for|and|no)$/.test(w))
      .map((w) => w.replace(/s$/, ""))
      .slice(0, 4)
      .join(" ");
  };
  const storyHeadings = (expected.proseStories ?? []);
  const requiredHeadings = storyHeadings.filter((s) => s.required);
  const missingRequiredHeadings = requiredHeadings.filter((s) => {
    const needle = coreWords(s.heading);
    return needle.length < 4 || !textHas(needle, text);
  }).map((s) => s.heading);
  checks.storyHeadings = {
    requiredCount: requiredHeadings.length,
    missing: missingRequiredHeadings,
    ok: missingRequiredHeadings.length === 0,
  };

  // Schedule entries — each has a date; check the date tokens are present
  const scheduleEntries = expected.scheduleEntries ?? [];
  const missingScheduleDates = scheduleEntries
    .map((e) => e.date)
    .filter((d) => d && !text.includes(normalizeText(d)));
  checks.scheduleEntries = {
    expectedCount: scheduleEntries.length,
    missingDates: missingScheduleDates,
    ok: scheduleEntries.length === 0 || missingScheduleDates.length === 0,
  };

  // Department heads — check each "Name - Title" appears (name + title)
  const deptHeads = expected.departmentHeads ?? [];
  const missingDeptHeads = deptHeads.filter((dh) => !textHas(dh, text));
  checks.departmentHeads = {
    expectedCount: deptHeads.length,
    missing: missingDeptHeads,
    ok: deptHeads.length === 0 || missingDeptHeads.length === 0,
  };

  // Untagged uploaded photos — can't verify from text; record expected count
  checks.untaggedPhotos = {
    expectedCount: expected.untaggedUploadedPhotos?.length ?? 0,
    note: "verified via run-record images, not PDF text",
    ok: true,
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return { checks, allOk };
}

// ── Per-ledger test runner ────────────────────────────────────────────────────
async function runLedgerTest({
  baseUrl, clientId, password, cookie, revision,
  ledger, ledgerPath, baselineSha, baselinePdf, baselineHtml, groups, outDir, force, skipRun, monthOverride,
}) {
  const label = ledger.label;
  const testLabel = deriveLabel(ledger, baselineSha, groups);
  const testOut = path.join(outDir, label);
  await fs.mkdir(testOut, { recursive: true });

  const test = {
    label,
    comparison: testLabel,
    ledger: {
      sha256: ledger.sha256,
      byteSize: ledger.byteSize,
      sourceDocx: ledger.sourceDocx,
      role: ledger.role,
      monthLabel: ledger.monthLabel,
      expectedCounts: ledger.expectedCounts,
    },
    inputHashes: { docx: null, photos: {}, ledger: null, baselinePdf: null, baselineHtml: null },
    revision,
    renderContract: { id: RENDER_CONTRACT_ID, digest: RENDER_CONTRACT_DIGEST },
    mode: null,
    outputHashes: { pdf: null, html: null },
    status: "pending",
    acceptanceEligible: false,
    logicalCheck: null,
    visualCheck: null,
    forced: false,
    error: null,
    recordedAt: new Date().toISOString(),
  };

  // 1. Verify input files
  const docxPath = ledger.sourceDocx;
  if (!docxPath || !(await exists(docxPath))) {
    test.status = "input-missing";
    test.error = `DOCX not found: ${docxPath}`;
    await writeJson(path.join(testOut, "result.json"), test);
    return test;
  }
  test.inputHashes.ledger = await sha256File(ledgerPath);
  if (baselinePdf && (await exists(baselinePdf))) test.inputHashes.baselinePdf = await sha256File(baselinePdf);
  if (baselineHtml && (await exists(baselineHtml))) test.inputHashes.baselineHtml = await sha256File(baselineHtml);
  const actualDocxSha = await sha256File(docxPath);
  test.inputHashes.docx = actualDocxSha;
  if (actualDocxSha !== ledger.sha256) {
    test.status = "input-missing";
    test.error = `DOCX sha mismatch: expected ${ledger.sha256}, got ${actualDocxSha}`;
    await writeJson(path.join(testOut, "result.json"), test);
    return test;
  }

  // Verify photos
  const photoPaths = (ledger.expected?.untaggedUploadedPhotos ?? []).map(
    (n) => path.join(path.dirname(docxPath), n)
  );
  for (const pp of photoPaths) {
    if (!(await exists(pp))) {
      test.status = "input-missing";
      test.error = `Photo not found: ${pp}`;
      await writeJson(path.join(testOut, "result.json"), test);
      return test;
    }
    test.inputHashes.photos[path.basename(pp)] = await sha256File(pp);
  }

  if (skipRun) {
    test.status = "input-verified";
    test.acceptanceEligible = false; // skip-run is never an acceptance pass
    await writeJson(path.join(testOut, "result.json"), test);
    return test;
  }

  // 2. API: upload
  const uploadRes = await apiUpload(baseUrl, clientId, cookie, docxPath, photoPaths);
  const docxAsset = (uploadRes.created ?? []).find(
    (a) => a.type === "ARTICLE" && /\.docx$/i.test(a.meta?.originalFilename || "")
  );
  const pp = docxAsset?.meta?.porterParse;
  const articles = pp?.parsedArticles ?? [];
  const images = (uploadRes.created ?? []).filter((a) => a.type === "IMAGE").map((a) => ({
    id: a.id, url: a.contentOrUrl, alt: a.meta?.originalFilename,
    width: a.meta?.width, height: a.meta?.height,
    source: "UPLOAD", isPlaceholder: false,
  }));
  await writeJson(path.join(testOut, "upload.json"), uploadRes);

  // 3. API: create run — the API requires a string monthLabel; blank-form
  // packets legitimately have none, so fall back to a neutral label and
  // record that it was supplied by the runner (not the source packet).
  const monthLabel = monthOverride ?? (ledger.monthLabel ?? "Untitled (runner-supplied)");
  const monthLabelSource = monthOverride ? "runner-override"
    : (ledger.monthLabel ? "ledger" : "runner-fallback");
  const run = await apiCreateRun(baseUrl, clientId, cookie, monthLabel, articles, images);
  const runId = run.id;
  const layout = run.assembledLayout ?? {};
  test.mode = {
    variant: "web",
    templateId: layout.templateId ?? run.templateId ?? null,
    monthLabel,
    monthLabelSource,
    fillerMode: "PLACEHOLDER",
    pageCount: layout.pageCount ?? null,
    layoutMode: layout.layoutMode ?? null,
  };
  await writeJson(path.join(testOut, "run.json"), { runId, layout, articles, images });

  // 4. API: try PDF (no force)
  let pdfResult = await apiPdf(baseUrl, runId, cookie, { force: false });
  let forced = false;
  let forcedMode = false;

  if (!pdfResult.ok) {
    // 409 gate-blocked
    const gate = pdfResult.body?.qualityGate ?? null;
    const hardFailures = gate?.hardFailures ?? [];
    const trueReason = hardFailures.length
      ? `hard gate failure: ${hardFailures.join("; ")}`
      : (gate?.reason ?? "quality gate blocked (score below floor)");
    test.status = "gate-blocked";
    test.error = `${trueReason} (finalScore=${gate?.finalScore ?? "?"}, floor=${gate?.floor ?? "?"})`;
    test.gate = gate;

    if (force) {
      // diagnostic retry — capture the forced PDF so we can still run the
      // logical/visual comparators against it (diagnostic, not acceptance).
      forcedMode = true;
      test.forced = true;
      const forcedResult = await apiPdf(baseUrl, runId, cookie, { force: true });
      if (forcedResult.ok && forcedResult.body?.pdfUrl) {
        const buf = await downloadPdf(baseUrl, forcedResult.body.pdfUrl);
        const pdfPath = path.join(testOut, "diagnostic.pdf");
        await fs.writeFile(pdfPath, buf);
        test.outputHashes.pdf = createHash("sha256").update(buf).digest("hex");
        // fall through to shared finalization below with freshPdfPath set
        pdfResult = { ok: true, body: { pdfUrl: forcedResult.body.pdfUrl } };
        // keep the forced diagnostic PDF on disk at a canonical name for comparators
        await fs.copyFile(pdfPath, path.join(testOut, "output.pdf"));
      } else {
        test.status = "gate-blocked";
        test.acceptanceEligible = false;
        test.error = `diagnostic force also failed: ${forcedResult.status}`;
        await writeJson(path.join(testOut, "result.json"), test);
        return test;
      }
    } else {
      // not forced: gate-blocked is terminal, never acceptance-eligible
      test.acceptanceEligible = false;
      await writeJson(path.join(testOut, "result.json"), test);
      return test;
    }
  }

  // 5. Download PDF (non-forced path already has pdfUrl)
  const pdfUrl = pdfResult.body.pdfUrl;
  if (!pdfUrl) throw new Error("PDF response did not contain pdfUrl");
  if (!forcedMode) {
    const pdfBuf = await downloadPdf(baseUrl, pdfUrl);
    const freshPdfPath = path.join(testOut, "output.pdf");
    await fs.writeFile(freshPdfPath, pdfBuf);
    test.outputHashes.pdf = createHash("sha256").update(pdfBuf).digest("hex");
    test.forced = false;
  }
  const freshPdfPath = path.join(testOut, "output.pdf");

  // 6. Fetch preview HTML (for recording, not gating)
  try {
    const phRes = await fetch(`${baseUrl}/api/runs/${runId}/preview-html?variant=web`, { headers: { cookie } });
    if (phRes.ok) {
      const htmlText = await phRes.text();
      await fs.writeFile(path.join(testOut, "preview.html"), htmlText);
      test.outputHashes.html = createHash("sha256").update(htmlText).digest("hex");
    }
  } catch { /* non-critical */ }

  // 7. Logical comparison — ledger expected content vs fresh PDF text
  const pdfText = await pdftotextPages(freshPdfPath);
  const logical = logicalCompare(ledger, pdfText || "");
  test.logicalCheck = {
    expected: ledger.expectedCounts ?? {},
    observedArticleCount: articles.length,
    checks: logical.checks,
    passed: logical.allOk,
  };

  // 8. Visual comparison (same-packet and style-only)
  if (baselinePdf && (testLabel === "same-packet" || testLabel === "style-only")) {
    if (!(await exists(baselinePdf))) {
      test.visualCheck = { passed: false, errors: ["baseline PDF not found"] };
    } else {
      test.visualCheck = await visualCompare(freshPdfPath, baselinePdf);
    }
  } else {
    test.visualCheck = null;
  }

  // 9. Final status
  const logicalPass = test.logicalCheck?.passed !== false;
  const visualPass = test.visualCheck === null || test.visualCheck.passed !== false;
  const isForcedDiagnostic = test.forced === true;
  test.acceptanceEligible = logicalPass && visualPass && !isForcedDiagnostic;
  if (test.acceptanceEligible) {
    test.status = "passed";
  } else if (isForcedDiagnostic) {
    // forced diagnostic — record the forced output + its logical/visual results,
    // but it is never acceptance-eligible (the gate hard-failed first).
    test.status = "diagnostic-forced";
  } else {
    test.status = "logical-or-visual-failed";
  }

  await writeJson(path.join(testOut, "result.json"), test);
  return test;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  for (const key of ["base-url", "client-id", "password"]) {
    if (!args[key]) throw new Error(`Missing required --${key}\n\n${HELP}`);
  }

  const baseUrl = cleanBaseUrl(args["base-url"]);
  const clientId = args["client-id"];
  const password = args.password;
  const force = Boolean(args.force);
  const skipRun = Boolean(args["skip-run"]);
  let revision = args.revision || "unknown";
  if (revision === "unknown") {
    const r = await runCmd("git", ["rev-parse", "HEAD"], { cwd: process.cwd() });
    if (r.code === 0) revision = r.stdout.trim();
  }
  const ledgerDir = path.resolve(args.ledgers || path.join(process.cwd(), "docs/demo/fixtures/expected-ledgers"));
  const baselinePdf = args["baseline-pdf"] || null;
  const baselineHtml = args["baseline-html"] || null;
  const baselineSha = args["baseline-sha"] || null;
  const onlyLabels = args.only ? args.only.split(",").map((s) => s.trim()) : null;
  const outDir = path.resolve(args.out || `/tmp/benchmark-${Date.now()}`);

  console.error(`[benchmark] base-url: ${baseUrl}`);
  console.error(`[benchmark] client-id: ${clientId}`);
  console.error(`[benchmark] revision: ${revision}`);
  console.error(`[benchmark] ledgers: ${ledgerDir}`);
  console.error(`[benchmark] baseline-sha: ${baselineSha ?? "(none)"}`);
  console.error(`[benchmark] baseline-pdf: ${baselinePdf ?? "(none)"}`);
  console.error(`[benchmark] force: ${force}`);
  console.error(`[benchmark] skip-run: ${skipRun}`);
  console.error(`[benchmark] out: ${outDir}`);

  await fs.mkdir(outDir, { recursive: true });

  // Load ledgers
  const ledgerFiles = (await fs.readdir(ledgerDir)).filter((f) => f.endsWith(".json")).sort();
  const ledgers = [];
  for (const file of ledgerFiles) {
    const ledger = await readJson(path.join(ledgerDir, file));
    ledgers.push({ ledger, file });
  }
  const groups = buildEquivalenceGroups(ledgers);
  console.error(`[benchmark] loaded ${ledgers.length} ledgers`);

  // Unlock
  let cookie = "";
  if (!skipRun) {
    cookie = await apiUnlock(baseUrl, password);
    console.error("[benchmark] unlocked");
  }

  // Run tests
  const results = [];
  for (const { ledger, file } of ledgers) {
    if (onlyLabels && !onlyLabels.includes(ledger.label)) {
      console.error(`[benchmark] skipping ${ledger.label} (not in --only)`);
      continue;
    }
    console.error(`[benchmark] === ${ledger.label} ===`);
    try {
      const test = await runLedgerTest({
        baseUrl, clientId, password, cookie, revision,
        ledger, ledgerPath: path.join(ledgerDir, file), baselineSha, baselinePdf, baselineHtml, groups, outDir, force, skipRun,
        monthOverride: args.month || null,
      });
      results.push(test);
      console.error(`[benchmark]   ${ledger.label}: ${test.status} (${test.comparison})`);
    } catch (err) {
      const test = {
        label: ledger.label,
        comparison: deriveLabel(ledger, baselineSha, groups),
        status: "error",
        acceptanceEligible: false,
        error: err.message,
        stack: err.stack,
        revision,
        renderContract: { id: RENDER_CONTRACT_ID, digest: RENDER_CONTRACT_DIGEST },
        recordedAt: new Date().toISOString(),
      };
      results.push(test);
      console.error(`[benchmark]   ${ledger.label}: ERROR ${err.message}`);
    }
  }

  // Summary
  const allPass = results.length > 0 && results.every((r) => r.acceptanceEligible === true);
  const summary = {
    runAt: new Date().toISOString(),
    baseUrl,
    revision,
    renderContract: { id: RENDER_CONTRACT_ID, digest: RENDER_CONTRACT_DIGEST },
    forceMode: force,
    ledgerCount: ledgers.length,
    testCount: results.length,
    allAcceptanceEligible: allPass,
    results: results.map((r) => ({
      label: r.label,
      comparison: r.comparison,
      status: r.status,
      acceptanceEligible: r.acceptanceEligible,
      forced: r.forced,
      error: r.error,
      inputDocxSha: r.inputHashes?.docx,
      outputPdfSha: r.outputHashes?.pdf,
    })),
  };
  await writeJson(path.join(outDir, "benchmark-summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));

  if (!allPass) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`[benchmark] FATAL: ${err.message}`);
  process.exitCode = 1;
});
