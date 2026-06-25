import { parseJson } from "../util/validate.js";
import {
  AssembledLayoutSchema,
  ArticleArraySchema,
  ImageRefArraySchema,
  RecurringSectionsSchema,
  type AssembledLayout,
  type Article,
  type ImageRef,
  type LayoutBlock,
} from "@newsforge/shared";
import type { Client, NewsletterRun, Template } from "@prisma/client";

/**
 * Server-rendered HTML for the internal /render/:id route.
 *
 * NOTE: Maya will eventually ship the full React preview tree. Until then this
 * file provides a faithful print-stylesheet'd HTML rendering of the assembled
 * layout so PDF generation works end-to-end on day one.
 */

function esc(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function renderRunHtml(opts: {
  run: NewsletterRun;
  client: Client;
  template: Template;
}): string {
  const layout = parseJson(AssembledLayoutSchema, opts.run.assembledLayout);
  const articles = parseJson(ArticleArraySchema, opts.run.articles);
  const images = parseJson(ImageRefArraySchema, opts.run.images);
  const recurringSections = parseJson(RecurringSectionsSchema, opts.client.recurringSections);
  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  const imageById = new Map(images.map((i) => [i.id, i] as const));

  const pagesHtml = layout.pages
    .map((page) => renderPage(page, articleById, imageById, opts.client, opts.run.monthLabel))
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(opts.client.name)} — ${esc(opts.run.monthLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(opts.client.headingFont).replace(/%20/g, "+")}:wght@400;600;700&family=${encodeURIComponent(opts.client.bodyFont).replace(/%20/g, "+")}:wght@400;600&display=swap">
<style>
  :root {
    --primary: ${esc(opts.client.primaryColor)};
    --secondary: ${esc(opts.client.secondaryColor)};
    --accent: ${esc(opts.client.accentColor)};
    --heading-font: '${esc(opts.client.headingFont)}', serif;
    --body-font: '${esc(opts.client.bodyFont)}', sans-serif;
  }
  @page { size: 8.5in 11in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #FAFAF7; font-family: var(--body-font); color: #1A1A1F; }
  body.print-mode .app-chrome { display: none; }
  .page {
    width: 8.5in; height: 11in;
    page-break-after: always;
    break-after: page;
    position: relative;
    background: #fff;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .page:last-child { page-break-after: auto; }
  .page-inner {
    position: absolute;
    inset: 0.5in;
    display: grid;
    gap: 0.18in;
  }
  .masthead {
    background: var(--primary);
    color: #fff;
    padding: 0.35in 0.4in;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .masthead .brand-name {
    font-family: var(--heading-font);
    font-size: 28pt;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .masthead .tagline {
    font-size: 10pt;
    opacity: 0.85;
  }
  .masthead .month {
    font-size: 11pt;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--secondary);
  }
  .block {
    background: #fff;
    border: 1px solid rgba(0,0,0,0.04);
    padding: 0.2in;
    overflow: hidden;
    border-radius: 2px;
  }
  .block-headline h1 {
    font-family: var(--heading-font);
    font-size: 24pt;
    line-height: 1.1;
    margin: 0 0 0.1in;
    color: var(--primary);
  }
  .block-body h2 {
    font-family: var(--heading-font);
    font-size: 14pt;
    margin: 0 0 0.08in;
    color: var(--primary);
  }
  .block-body p { font-size: 10pt; line-height: 1.45; margin: 0 0 0.08in; white-space: pre-wrap; }
  .block-sidebar {
    background: color-mix(in srgb, var(--secondary) 35%, white);
    border-left: 3px solid var(--accent);
  }
  .block-sidebar h3 {
    font-family: var(--heading-font);
    font-size: 12pt;
    margin: 0 0 0.06in;
    color: var(--primary);
  }
  .block-sidebar p { font-size: 9.5pt; line-height: 1.4; white-space: pre-wrap; }
  .block-image, .block-gallery {
    padding: 0;
    background: var(--secondary);
    position: relative;
  }
  .block-image img, .block-gallery img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .image-caption {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.55), transparent);
    color: #fff; padding: 0.18in;
    font-size: 9pt;
  }
  .block-footer {
    background: var(--primary);
    color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.18in 0.3in;
    font-size: 9pt;
  }
  .block-placeholder {
    border: 1px dashed rgba(0,0,0,0.2);
    color: #6B6B73;
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-style: italic;
    font-size: 10pt;
  }
  .recurring-strip {
    display: flex; flex-wrap: wrap; gap: 0.12in;
    margin-top: 0.05in;
  }
  .recurring-strip .chip {
    font-size: 8pt; padding: 0.04in 0.1in;
    background: rgba(0,0,0,0.04);
    border-radius: 999px;
  }
</style>
</head>
<body class="print-mode">
${pagesHtml}
<script>
  (async function () {
    try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch (e) {}
    var imgs = Array.from(document.images || []);
    try {
      await Promise.all(imgs.map(function (i) {
        if (i.complete) return Promise.resolve();
        return new Promise(function (res) { i.addEventListener('load', res); i.addEventListener('error', res); });
      }));
    } catch (e) {}
    window.__NEWSFORGE_READY__ = true;
  })();
</script>
</body>
</html>`;
}

function renderPage(
  page: { pageNumber: number; template: { gridCols: number; gridRows: number }; blocks: LayoutBlock[] },
  articleById: Map<string, Article>,
  imageById: Map<string, ImageRef>,
  client: Client,
  monthLabel: string,
): string {
  const { gridCols, gridRows } = page.template;
  const blocksHtml = page.blocks
    .map((b) => renderBlock(b, articleById, imageById, client, monthLabel, gridCols, gridRows))
    .join("");
  return `<section class="page">
    <div class="page-inner" style="grid-template-columns: repeat(${gridCols}, 1fr); grid-template-rows: repeat(${gridRows}, 1fr);">
      ${blocksHtml}
    </div>
  </section>`;
}

function gridStyle(b: LayoutBlock, cols: number, rows: number): string {
  const x = Math.max(0, Math.min(cols - 1, b.x));
  const y = Math.max(0, Math.min(rows - 1, b.y));
  const w = Math.max(1, Math.min(cols - x, b.w));
  const h = Math.max(1, Math.min(rows - y, b.h));
  return `grid-column: ${x + 1} / span ${w}; grid-row: ${y + 1} / span ${h};`;
}

function renderBlock(
  b: LayoutBlock,
  articleById: Map<string, Article>,
  imageById: Map<string, ImageRef>,
  client: Client,
  monthLabel: string,
  cols: number,
  rows: number,
): string {
  const style = gridStyle(b, cols, rows);
  const ref = b.contentRef;
  const article = ref.kind === "article" && ref.id ? articleById.get(ref.id) : undefined;
  const image = ref.kind === "image" && ref.id ? imageById.get(ref.id) : undefined;

  switch (b.type) {
    case "masthead":
      return `<div class="block masthead" style="${style}">
        <div>
          <div class="brand-name">${esc(client.name)}</div>
          <div class="tagline">${esc(client.tagline)}</div>
        </div>
        <div class="month">${esc(monthLabel)}</div>
      </div>`;
    case "footer":
      return `<div class="block block-footer" style="${style}">
        <span>${esc(client.name)} · ${esc(client.city)}</span>
        <span>Newsletter · ${esc(monthLabel)}</span>
      </div>`;
    case "headline": {
      const title = article?.title ?? ref.inline?.title ?? "A note from the community";
      const lede = article?.body?.split("\n")[0] ?? ref.inline?.body ?? "";
      return `<div class="block block-headline" style="${style}">
        <h1>${esc(title)}</h1>
        <p>${esc(lede.slice(0, 240))}</p>
      </div>`;
    }
    case "body": {
      if (article) {
        const paras = article.body.split(/\n+/).slice(0, 6).map((p) => `<p>${esc(p)}</p>`).join("");
        return `<div class="block block-body" style="${style}">
          <h2>${esc(article.title)}</h2>
          ${paras}
        </div>`;
      }
      return `<div class="block block-body" style="${style}">
        <h2>${esc(ref.inline?.title ?? "From the community")}</h2>
        <p>${esc(ref.inline?.body ?? "Filler copy — awaiting content.")}</p>
      </div>`;
    }
    case "sidebar": {
      if (article) {
        return `<div class="block block-sidebar" style="${style}">
          <h3>${esc(article.title)}</h3>
          <p>${esc(article.body.split("\n").slice(0, 4).join("\n"))}</p>
        </div>`;
      }
      return `<div class="block block-sidebar" style="${style}">
        <h3>${esc(ref.inline?.title ?? "Sidebar")}</h3>
        <p>${esc(ref.inline?.body ?? "")}</p>
      </div>`;
    }
    case "image":
    case "gallery": {
      const url = image?.url ?? "";
      const alt = image?.alt ?? ref.inline?.caption ?? "image";
      const caption = ref.inline?.caption ?? alt;
      return `<div class="block ${b.type === "gallery" ? "block-gallery" : "block-image"}" style="${style}">
        ${url ? `<img src="${esc(url)}" alt="${esc(alt)}" />` : `<div class="block-placeholder" style="width:100%;height:100%">Photo placeholder</div>`}
        ${caption ? `<div class="image-caption">${esc(caption)}</div>` : ""}
      </div>`;
    }
  }
  return `<div class="block block-placeholder" style="${style}">${esc(ref.inline?.caption ?? "Placeholder")}</div>`;
}
