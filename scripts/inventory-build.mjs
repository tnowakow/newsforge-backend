// build source asset inventory from evidence/input-manifest.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base = '/home/tom/.openclaw/workspace/dev-team/newsforge/newsforge-backend';
const manifestPath = path.join(base, 'docs/trilogy-review-2026-09-09/evidence/input-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outPath = path.join(base, 'docs/trilogy-review-2026-09-09/evidence/source-asset-inventory.json');

function classify(entry) {
  const name = path.basename(entry.path);
  if (name.endsWith('.docx')) {
    const dir = path.basename(path.dirname(entry.path));
    if (dir === 'Template Test') {
      if (/^Blank-Template/i.test(name)) return { role: 'docx', kind: 'blank-form' };
      if (/^July Campus Newsletter Content/i.test(name)) return { role: 'docx', kind: 'filled', label: 'july-campus' };
      if (/^July Newsletter Content\d/i.test(name)) {
        const n = Number(name.match(/Content(\d)/)[1]);
        return { role: 'docx', kind: 'filled', label: `july-content-${n}` };
      }
      return { role: 'docx', kind: 'filled', label: 'july-primary' };
    }
    return { role: 'docx', kind: 'other' };
  }
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')) {
    return { role: 'photo' };
  }
  if (name.endsWith('.pdf')) {
    const m = name.match(/^example-(\d+)\.pdf$/);
    if (m) return { role: 'reference-pdf', exampleIndex: Number(m[1]) };
    return { role: 'reference-pdf' };
  }
  if (name.endsWith('.md')) return { role: 'markdown-doc' };
  return { role: 'other' };
}

function pageNormalization(exampleIndex) {
  if (exampleIndex == null) return null;
  if (exampleIndex >= 1 && exampleIndex <= 5) {
    return { logicalPages: [1], note: 'single wide page split into 5 reference files 01-05' };
  }
  return { logicalPages: [1, 2], note: 'physical pages 1-2' };
}

function jpegDimensions(buf) {
  // parse JPEG SOF0/SOF2 markers
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) { i += 2; continue; }
    i += 2 + len;
  }
  return null;
}

const entries = [];
const problems = [];
for (const e of manifest) {
  const entry = { ...e, name: path.basename(e.path) };
  Object.assign(entry, classify(e));
  if (entry.role === 'reference-pdf') {
    Object.assign(entry, { pageNormalization: pageNormalization(entry.exampleIndex ?? null) });
  }
  entries.push(entry);
  if (!fs.existsSync(e.path)) {
    entry.present = false;
    problems.push(`missing: ${e.path}`);
    continue;
  }
  entry.present = true;
  const buf = fs.readFileSync(e.path);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  entry.bytesVerified = buf.length === e.bytes;
  entry.sha256Verified = sha === e.sha256;
  if (entry.role === 'photo' && entry.name.endsWith('.jpg')) {
    const dims = jpegDimensions(buf);
    if (dims) {
      entry.width = dims.width;
      entry.height = dims.height;
      entry.orientation = dims.width >= dims.height ? 'landscape-or-square' : 'portrait';
    } else {
      problems.push(`could not read JPEG dimensions: ${e.path}`);
    }
  }
  if (!entry.bytesVerified) problems.push(`size mismatch: ${e.path} actual=${buf.length} expected=${e.bytes}`);
  if (!entry.sha256Verified) problems.push(`hash mismatch: ${e.path} actual=${sha} expected=${e.sha256}`);
}

// PDF page counts (physical pages) without external deps: scan /Type /Page count is unreliable; use pdfjs? Not available.
// Try pdftoppm/pdfinfo via child_process for reference PDFs.
const { execFileSync } = await import('node:child_process');
const refEntries = entries.filter(x => x.role === 'reference-pdf' && x.present);
for (const re of refEntries) {
  try {
    const out = execFileSync('pdfinfo', [re.path], { encoding: 'utf8', timeout: 20000 });
    const m = out.match(/Pages:\s*(\d+)/);
    re.physicalPages = m ? Number(m[1]) : null;
  } catch (err) {
    re.physicalPages = null;
    problems.push(`pdfinfo failed for ${re.path}: ${String(err).slice(0, 120)}`);
  }
}

const inventory = {
  id: 'trilogy-source-asset-inventory',
  generatedAt: new Date().toISOString(),
  sourceManifest: 'evidence/input-manifest.json',
  planNormalization: {
    rule: 'references 01-05 split one wide page into five files; 06-30 use physical pages 1-2',
    logicalPageMap: {
      '01-05': { physicalPages: 1, note: 'single wide page split across example-01..05' },
      '06-30': { physicalPages: 2, note: 'physical pages 1-2' },
    },
  },
  counts: {
    docx: entries.filter(x => x.role === 'docx').length,
    photos: entries.filter(x => x.role === 'photo').length,
    referencePdfs: entries.filter(x => x.role === 'reference-pdf').length,
    markdownDocs: entries.filter(x => x.role === 'markdown-doc').length,
    total: entries.length,
  },
  entries,
  problems,
};

fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
console.log('wrote', outPath);
console.log(JSON.stringify(inventory.counts));
console.log('problems:', problems.length ? problems : 'none');
