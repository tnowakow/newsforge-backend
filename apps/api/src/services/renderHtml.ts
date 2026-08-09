/**
 * v3 print renderer — server-rendered HTML for Puppeteer. NOT user-facing.
 *
 * Fully data-driven: every visual decision comes from the layout model
 * (block.style panel tokens, heading colors, captions, list content) and
 * the client brand kit. The v2 hardcoded per-client branches ("trilogy-rich",
 * fixed birthday/event lists, title-regex content matching) are GONE — the
 * same renderer produces every client's newsletter, which is the only way
 * the AI designer's output and the printed page can agree.
 *
 * Geometry: two letter pages (the 11×17 inner spread). 1in = 96px on
 * screen; @page prints at true letter size.
 */
import type {
  AssembledLayout,
  Article,
  GridSpec,
  LayoutBlock,
  NewsImage,
  PanelToken,
  RecurringSection,
} from "@newsforge/shared/schemas";
import {
  DARK_TOKENS,
  resolveToken,
  type BrandColors,
} from "./designLanguage.js";

interface RenderInput {
  clientName: string;
  monthLabel: string;
  brandKit: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headingFont: string;
    bodyFont: string;
    logoUrl: string | null;
  };
  gridSpec: GridSpec;
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  /**
   * "web" (default) renders the byte-stable on-screen/preview HTML: Letter
   * pages, no bleed, no crop marks (Vitaly rule 6 + V2-PRINT-VALIDATION §7.2).
   * "print" adds the bleed-fill wrapper, @page landscape spread size, and
   * crop-marks SVG per V2-PRINT-VALIDATION §2/§3 — used only by the
   * Puppeteer print-PDF render pass (pdf.ts variant="print").
   * "spread" renders a PorterOne-style 17x11 inner spread on one sheet.
   */
  variant?: "web" | "print" | "spread";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function token(input: RenderInput, t: PanelToken | undefined): string | null {
  if (!t || t === "paper") return null;
  const brand: BrandColors = input.brandKit;
  return resolveToken(t, brand);
}

function imageInlineStyle(img: NewsImage): string {
  const focalX = img.focalX ?? 50;
  const focalY = img.focalY ?? 50;
  const zoom = img.zoom ?? 1;
  return `object-position:${focalX}% ${focalY}%;transform:scale(${zoom});transform-origin:${focalX}% ${focalY}%;`;
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

function renderList(block: LayoutBlock): string {
  const rows = (block.listItems ?? [])
    .map((item) =>
      item.isGroupHeader
        ? `<div class="list-group">${esc(item.label)}</div>`
        : `<div class="list-row"><span class="list-label">${esc(item.label)}</span><span class="list-value">${esc(item.value ?? "")}</span></div>`,
    )
    .join("");
  return `<div class="list-body">${rows}</div>`;
}

function roleClass(b: LayoutBlock): string {
  return b.style?.panelRole ? ` role-${b.style.panelRole}` : "";
}

function photoClass(b: LayoutBlock): string {
  return b.style?.photoTreatment ? ` photo-${b.style.photoTreatment}` : "";
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function copyDensityClass(
  b: LayoutBlock,
  article: Article | undefined,
): string {
  if (b.kind === "image") return "";
  const area = b.position.colSpan * b.position.rowSpan;
  const words =
    article?.wordCount ??
    (b.inlineText ? countWords(b.inlineText) : 0);
  const rows = b.listItems?.length ?? 0;
  const utilityUnits = Math.max(words, rows * 9);
  if (area >= 120 && utilityUnits < area * 1.35) return " copy-fill-xl";
  if (area >= 70 && utilityUnits < area * 1.1) return " copy-fill-lg";
  if (area >= 36 && utilityUnits < area * 0.85) return " copy-fill-md";
  return "";
}

function personalityClass(layout: AssembledLayout): string {
  if (layout.visualPersonality) return `personality-${layout.visualPersonality}`;
  const templateId = layout.templateId;
  if (templateId.includes("panel-garden")) return "personality-panel-garden";
  if (templateId.includes("photo-festival")) return "personality-photo-festival";
  if (templateId.includes("resident-feature")) return "personality-resident-feature";
  if (templateId.includes("editorial-light")) return "personality-editorial-light";
  return "personality-classic";
}

function renderBlock(input: RenderInput, b: LayoutBlock): string {
  const articlesById = new Map(input.articles.map((a) => [a.id, a]));
  const imagesById = new Map(input.images.map((i) => [i.id, i]));
  const sectionsById = new Map(input.recurringSections.map((s) => [s.id, s]));
  const article = b.articleId ? articlesById.get(b.articleId) : undefined;
  const section = b.sectionId ? sectionsById.get(b.sectionId) : undefined;

  const bg = token(input, b.style?.bg);
  const headerColor =
    token(input, b.style?.headerColor) ?? input.brandKit.primaryColor;
  const invert = b.style?.invertText || (b.style?.bg && DARK_TOKENS.has(b.style.bg));
  const radius = b.style?.cornerRadius ?? (bg ? 10 : 0);

  const outerStyle =
    `grid-column:${b.position.col} / span ${b.position.colSpan};` +
    `grid-row:${b.position.row} / span ${b.position.rowSpan};` +
    `z-index:${b.zIndex ?? 0};`;
  const panelStyle =
    (bg ? `background:${bg};` : "") +
    (radius ? `border-radius:${radius}px;` : "") +
    (invert ? "color:#F7F5EF;" : "");

  const headingHtml = (text: string) =>
    b.style?.panelRole === "directorCorner" && /executive director|director corner|from (our )?executive director/i.test(text)
      ? `<h2 class="director-heading" style="color:${invert ? "#F7F5EF" : headerColor}"><span>EXECUTIVE DIRECTOR</span> <em>Corner</em></h2>`
      : b.style?.scriptHeading
      ? `<h2 class="script-heading" style="color:${invert ? "#F7F5EF" : headerColor}">${esc(text)}</h2>`
      : `<h2 class="section-heading" style="color:${invert ? "#F7F5EF" : headerColor}">${esc(text)}</h2>`;

  let inner = "";

  if (b.kind === "list") {
    inner = `${b.heading ? headingHtml(b.heading) : ""}${renderList(b)}`;
  } else if (b.kind === "image" && b.imageId) {
    const img = imagesById.get(b.imageId);
    if (img) {
      inner = `
        <figure class="photo${photoClass(b)}">
          <div class="photo-frame"><img src="${esc(img.url)}" alt="${esc(img.alt ?? "")}" style="${imageInlineStyle(img)}"/></div>
          ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}
        </figure>`;
    }
  } else if (b.kind === "article" || b.kind === "recurring" || b.kind === "filler") {
    const title = b.heading ?? article?.title ?? section?.title ?? "";
    const bodyHtml = article
      ? paragraphs(article.body)
      : b.inlineText
        ? paragraphs(b.inlineText)
        : "";
    inner = `
      ${title ? headingHtml(title) : ""}
      ${article?.byline ? `<div class="byline">By ${esc(article.byline)}</div>` : ""}
      <div class="body${b.style?.centered ? " centered" : ""}${b.style?.compact ? " compact" : ""}">${bodyHtml}</div>`;
  } else {
    // empty / placeholder — render nothing in print output.
    return "";
  }

  const densityClass = copyDensityClass(b, article);
  return `<div class="block${roleClass(b)}${densityClass}" data-block-id="${esc(b.blockId)}" data-slot-id="${esc(b.slotId)}" style="${outerStyle}"><div class="block-inner${bg ? " panel" : ""}${roleClass(b)}${densityClass}" style="${panelStyle}">${inner}</div></div>`;
}

function masthead(input: RenderInput, page: number): string {
  if (page !== 1) {
    return `<header class="masthead slim"><span style="color:${input.brandKit.accentColor}">${esc(input.clientName)}</span><span>${esc(input.monthLabel)}</span></header>`;
  }
  const logo = input.brandKit.logoUrl
    ? `<img class="logo" src="${esc(input.brandKit.logoUrl)}" alt="${esc(input.clientName)} logo"/>`
    : "";
  return `
    <header class="masthead">
      ${logo}
      <div>
        <div class="kicker" style="color:${input.brandKit.accentColor}">${esc(input.monthLabel)} · Community Newsletter</div>
        <h1 style="color:${input.brandKit.primaryColor}">${esc(input.clientName)}</h1>
      </div>
    </header>`;
}

export function renderRunHtml(input: RenderInput): string {
  const cols = input.gridSpec.columns;
  const rows = input.gridSpec.rowsPerPage;
  const pages = new Map<number, string[]>();
  const personality = personalityClass(input.layout);
  for (let p = 1; p <= input.layout.pageCount; p++) pages.set(p, []);
  for (const b of input.layout.blocks) {
    if (!pages.has(b.page)) pages.set(b.page, []);
    pages.get(b.page)!.push(renderBlock(input, b));
  }

  const sortedPages = [...pages.entries()].sort(([a], [b]) => a - b);
  const isSpread = input.variant === "spread" && input.layout.pageCount === 2;
  const pageSections = isSpread
    ? `
    <section class="spread-sheet ${personality}" data-spread="inner">
      ${sortedPages
        .map(
          ([page, blocks]) => `
      <section class="page spread-panel ${personality}" data-page="${page}">
        <div class="content" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));">
          ${blocks.join("\n")}
        </div>
      </section>`,
        )
        .join("\n")}
    </section>`
    : sortedPages
      .map(
        ([page, blocks]) => `
    <section class="page ${personality}" data-page="${page}">
      ${masthead(input, page)}
      <div class="content" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));">
        ${blocks.join("\n")}
      </div>
      <footer class="pagefoot" style="border-color:${input.brandKit.accentColor}">
        <span>${esc(input.clientName)}</span><span>${esc(input.monthLabel)} · Page ${page}</span>
      </footer>
    </section>`,
      )
      .join("\n");

  const pageCss =
    input.variant === "spread"
      ? `
  @page { size: 17in 11in; margin: 0; }
  .spread-sheet {
    width: 17in; height: 11in; display:grid; grid-template-columns:1fr 1fr;
    background:#fff; overflow:hidden; page-break-after: always;
  }
  .spread-sheet .page {
    width: 8.5in; height: 11in; padding: 0.12in 0.13in 0.13in;
    page-break-after: auto; overflow:hidden; display:flex; flex-direction:column;
  }
  .spread-sheet .page + .page { border-left: 1px solid rgba(21,27,43,0.08); }
  .spread-sheet .content { flex:1; min-height:0; display:grid; gap: 3px; }
  .spread-sheet .block-inner.panel { padding: 6px 8px; }
  .spread-sheet .section-heading { font-size: clamp(10pt, 1.6vw, 14pt); margin-bottom:2pt; }
  .spread-sheet .script-heading { font-size: clamp(12pt, 1.85vw, 17pt); margin-bottom:2pt; }
  .spread-sheet .body { font-size: 8.2pt; line-height: 1.16; }
  .spread-sheet .body.compact { font-size: 7.9pt; line-height: 1.12; }
  .spread-sheet .list-body { font-size: 8.4pt; line-height: 1.12; }
  .spread-sheet .photo figcaption { font-size: 5.4pt; line-height:0.95; max-height: 10pt; letter-spacing:0.04em; }
  .spread-sheet .role-photoCluster .photo figcaption { display:none; }
  .spread-sheet .copy-fill-lg,
  .spread-sheet .copy-fill-xl { justify-content:flex-start; }
  .spread-sheet .copy-fill-md .section-heading { font-size: clamp(12pt, 1.9vw, 16pt); }
  .spread-sheet .copy-fill-md .script-heading { font-size: clamp(13pt, 2vw, 17pt); }
  .spread-sheet .copy-fill-md .body { font-size: 9.1pt; line-height: 1.16; }
  .spread-sheet .copy-fill-md .list-body { font-size: 9pt; line-height: 1.1; }
  .spread-sheet .copy-fill-lg .section-heading { font-size: clamp(13pt, 2.1vw, 18pt); }
  .spread-sheet .copy-fill-lg .script-heading { font-size: clamp(15pt, 2.25vw, 20pt); }
  .spread-sheet .copy-fill-lg .body { font-size: 10.2pt; line-height: 1.14; }
  .spread-sheet .copy-fill-lg .list-body { font-size: 10pt; line-height: 1.08; }
  .spread-sheet .copy-fill-xl .section-heading { font-size: clamp(15pt, 2.35vw, 21pt); }
  .spread-sheet .copy-fill-xl .script-heading { font-size: clamp(17pt, 2.6vw, 24pt); }
  .spread-sheet .copy-fill-xl .body { font-size: 11.4pt; line-height: 1.12; }
  .spread-sheet .copy-fill-xl .list-body { font-size: 10.8pt; line-height: 1.06; }
  .spread-sheet .role-directorCorner .body { font-size: 8.5pt; line-height: 1.12; column-count:2; column-gap:12px; font-weight:500; }
  .spread-sheet .role-spotlightRail .body { font-size: 9.2pt; line-height: 1.13; text-align:left; font-weight:600; }
  .spread-sheet .role-featureBand .body { font-size: 8.8pt; line-height: 1.12; text-align:left; font-weight:600; }
  .spread-sheet .role-infoFooter .body { font-size: 7.4pt; line-height: 1.04; font-weight:600; }
  .spread-sheet .role-infoFooter .section-heading,
  .spread-sheet .role-infoFooter .script-heading { font-size: 14pt; margin-bottom:2pt; }
`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  :root {
    --heading-font: ${input.brandKit.headingFont}, Georgia, serif;
    --body-font: ${input.brandKit.bodyFont}, Georgia, serif;
  }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family: var(--body-font); color:#20242B; background:#fff; }
  @page { size: letter; margin: 0; }
  .page {
    width: 8.5in; height: 11in; position: relative;
    padding: 0.34in 0.34in 0.4in;
    page-break-after: always; overflow: hidden;
    display: flex; flex-direction: column;
  }
    .masthead { margin-bottom: 0.08in; font-family: var(--heading-font); display:flex; align-items:center; gap:12px; min-height:38px; }
    .masthead .logo { max-height:40px; max-width:118px; object-fit:contain; }
    .masthead .kicker { font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; }
  .masthead h1 { font-size: 26pt; line-height: 1.05; margin-top: 2pt; }
  .masthead.slim { display:flex; justify-content:space-between; font-size:8pt; letter-spacing:0.14em; text-transform:uppercase; color:#777; margin-bottom:0.08in; }
  .content { flex:1; min-height:0; display:grid; gap: 4px; }
  .block { min-height: 0; min-width: 0; display:flex; overflow:hidden; }
  .block-inner { flex:1; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
    .block-inner.panel { padding: 7px 9px; }
    .section-heading { font-family: var(--heading-font); font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-size: clamp(11pt, 2.1vw, 15pt); line-height:1.0; margin-bottom: 3pt; text-align:center; }
    .script-heading { font-family: var(--heading-font); font-style: italic; font-weight: 800; font-size: clamp(12pt, 2.25vw, 16pt); line-height:1.03; margin-bottom: 3pt; }
    .byline { font-size: 7.4pt; color: inherit; opacity:0.7; margin-bottom: 2pt; }
    .body { font-size: 8.8pt; line-height: 1.24; overflow:hidden; }
    .body.compact { font-size: 8.5pt; line-height: 1.18; }
    .body p + p { margin-top: 2.5pt; }
    .body.centered { text-align:center; }
  .list-body { font-size: 8.8pt; line-height: 1.28; }
  .list-group { font-weight: 800; letter-spacing: 0.12em; font-size: 7.5pt; margin: 3pt 0 1.5pt; opacity: 0.85; }
  .list-row { display:flex; justify-content:space-between; gap: 8px; border-bottom: 1px dotted rgba(0,0,0,0.12); padding: 1pt 0; }
  .block-inner[style*="color:#F7F5EF"] .list-row { border-bottom-color: rgba(255,255,255,0.25); }
  .list-label { font-weight: 600; }
  .photo { flex:1; display:flex; flex-direction:column; min-height:0; }
    .photo-frame { flex:1; min-height:0; overflow:hidden; border-radius: 8px; }
    .photo-frame img { width:100%; height:100%; object-fit:cover; display:block; }
    .photo figcaption { font-size: 6.7pt; line-height:1.08; font-style: italic; text-align:center; padding-top: 1.5pt; color:#555; max-height: 15pt; overflow:hidden; }
    .copy-fill-md .section-heading { font-size: clamp(12pt, 2.35vw, 17pt); }
    .copy-fill-md .body { font-size: 9.6pt; line-height: 1.22; }
    .copy-fill-md .list-body { font-size: 9.8pt; line-height: 1.2; }
    .copy-fill-lg { justify-content:center; }
    .copy-fill-lg .section-heading { font-size: clamp(13pt, 2.7vw, 19pt); margin-bottom:4pt; }
    .copy-fill-lg .script-heading { font-size: clamp(15pt, 3vw, 21pt); margin-bottom:4pt; }
    .copy-fill-lg .body { font-size: 10.4pt; line-height: 1.2; }
    .copy-fill-lg .list-body { font-size: 10.6pt; line-height: 1.16; }
    .copy-fill-xl { justify-content:center; }
    .copy-fill-xl .section-heading { font-size: clamp(15pt, 3.1vw, 22pt); margin-bottom:5pt; }
    .copy-fill-xl .script-heading { font-size: clamp(17pt, 3.4vw, 24pt); margin-bottom:5pt; }
    .copy-fill-xl .body { font-size: 11.2pt; line-height: 1.18; }
    .copy-fill-xl .list-body { font-size: 11.4pt; line-height: 1.12; }
    .photo-collage .photo-frame { border-radius: 10px; }
    .photo-wide .photo-frame { border-radius: 12px; }
    .photo-portrait .photo-frame { border-radius: 12px; }
    .personality-panel-garden .masthead { min-height:34px; padding-bottom:5pt; border-bottom:2px solid ${input.brandKit.secondaryColor}; }
    .personality-panel-garden .masthead h1 { font-size:20pt; letter-spacing:0.03em; text-transform:uppercase; }
    .personality-panel-garden .content { gap:5px; }
    .personality-panel-garden .block-inner.panel { padding:8px 10px; border-radius:4px !important; }
    .personality-panel-garden .photo-frame { border-radius:4px; outline:2px solid rgba(21,27,43,0.12); outline-offset:-2px; }
    .personality-panel-garden .section-heading { font-size:clamp(10pt,1.9vw,13pt); letter-spacing:0.08em; }
    .personality-photo-festival .masthead { min-height:36px; padding:7pt 9pt; border-radius:0; background:${input.brandKit.primaryColor}; color:#F7F5EF; }
    .personality-photo-festival .masthead .kicker,
    .personality-photo-festival .masthead h1 { color:#F7F5EF !important; }
    .personality-photo-festival .masthead h1 { font-size:21pt; text-transform:uppercase; letter-spacing:0.04em; }
    .personality-photo-festival .content { gap:4px; }
    .personality-photo-festival .photo-frame { border-radius:2px; }
    .personality-photo-festival .photo-frame img { filter:saturate(1.12) contrast(1.04); }
    .personality-photo-festival .photo figcaption { font-style:normal; text-transform:uppercase; letter-spacing:0.08em; font-size:5.9pt; color:#333; }
    .personality-photo-festival .block-inner.panel { padding:8px 10px; border-radius:2px !important; }
    .personality-resident-feature .masthead { min-height:50px; border-left:9px solid ${input.brandKit.accentColor}; padding-left:10pt; }
    .personality-resident-feature .masthead h1 { font-size:24pt; }
    .personality-resident-feature .content { gap:5px; }
    .personality-resident-feature .photo-portrait .photo-frame,
    .personality-resident-feature .photo-wide .photo-frame { border-radius:16px; }
    .personality-resident-feature .role-spotlightRail.panel,
    .personality-resident-feature .role-directorCorner.panel { border-radius:16px !important; }
    .personality-resident-feature .section-heading { text-transform:none; letter-spacing:0.01em; }
    .personality-editorial-light .masthead { min-height:32px; border-bottom:1px solid rgba(21,27,43,0.18); }
    .personality-editorial-light .masthead h1 { font-size:19pt; font-weight:700; letter-spacing:0; }
    .personality-editorial-light .masthead .kicker { letter-spacing:0.12em; }
    .personality-editorial-light .content { gap:5px; }
    .personality-editorial-light .block-inner.panel { padding:8px 10px; border-radius:0 !important; }
    .personality-editorial-light .section-heading { font-size:clamp(10pt,1.8vw,13pt); letter-spacing:0.02em; }
    .personality-editorial-light .body { font-size:9.2pt; line-height:1.22; }
    .personality-editorial-light .photo-frame { border-radius:0; }
    .personality-garden-warmth .masthead { min-height:36px; padding-bottom:5pt; border-bottom:2px solid ${input.brandKit.secondaryColor}; }
    .personality-garden-warmth .masthead h1 { font-size:21pt; letter-spacing:0.02em; }
    .personality-garden-warmth .content { gap:5px; }
    .personality-garden-warmth .block-inner.panel { padding:8px 10px; }
    .personality-garden-warmth .photo-frame { outline:2px solid rgba(21,27,43,0.10); outline-offset:-2px; }
    .personality-photo-journal .masthead { min-height:36px; padding:7pt 9pt; border-radius:0; background:${input.brandKit.primaryColor}; color:#F7F5EF; }
    .personality-photo-journal .masthead .kicker,
    .personality-photo-journal .masthead h1 { color:#F7F5EF !important; }
    .personality-photo-journal .masthead h1 { font-size:21pt; text-transform:uppercase; letter-spacing:0.04em; }
    .personality-photo-journal .content { gap:4px; }
    .personality-photo-journal .photo-frame { border-radius:2px; }
    .personality-photo-journal .photo figcaption { font-style:normal; text-transform:uppercase; letter-spacing:0.08em; font-size:5.9pt; color:#333; }
    .personality-resident-spotlight .masthead { min-height:50px; border-left:9px solid ${input.brandKit.accentColor}; padding-left:10pt; }
    .personality-resident-spotlight .masthead h1 { font-size:24pt; }
    .personality-resident-spotlight .content { gap:7px; }
    .personality-resident-spotlight .section-heading { text-transform:none; letter-spacing:0.01em; }
    .personality-editorial-calm .masthead { min-height:32px; border-bottom:1px solid rgba(21,27,43,0.18); }
    .personality-editorial-calm .masthead h1 { font-size:19pt; font-weight:700; letter-spacing:0; }
    .personality-editorial-calm .content { gap:5px; }
    .personality-editorial-calm .block-inner.panel { padding:8px 10px; border-radius:0 !important; }
    .personality-editorial-calm .photo-frame { border-radius:0; }
    .personality-celebration-pop .masthead { min-height:38px; padding:7pt 10pt; background:${input.brandKit.accentColor}; color:#151B2B; }
    .personality-celebration-pop .masthead .kicker,
    .personality-celebration-pop .masthead h1 { color:#151B2B !important; }
    .personality-celebration-pop .masthead h1 { font-size:22pt; text-transform:uppercase; letter-spacing:0.04em; }
    .personality-celebration-pop .content { gap:5px; }
    .personality-celebration-pop .block-inner.panel { padding:9px 11px; border-radius:4px !important; }
    .personality-celebration-pop .photo-frame { border-radius:4px; }
    .personality-celebration-pop .photo figcaption { font-style:normal; font-weight:700; color:#333; }
    .role-birthday {
      background-image: radial-gradient(circle, rgba(21,27,43,0.22) 0 2px, transparent 2.4px);
      background-size: 18px 18px;
    }
    .role-birthday.panel { padding: 8px 10px 6px; border-bottom: 6px solid #D85C2A; }
    .role-birthday .script-heading { font-size: 18pt; text-align:left; margin-bottom:3pt; }
    .role-birthday .list-body { font-size: 8.2pt; line-height: 1.06; }
    .role-birthday .list-group { color:#D85C2A; font-size: 8.2pt; margin-top: 4pt; }
    .role-birthday .list-row { border-bottom: 0; }
    .role-directorCorner.panel { padding: 11px 14px; }
    .role-directorCorner .script-heading { font-size: clamp(17pt, 3vw, 23pt); font-style: normal; text-transform: uppercase; letter-spacing:0.02em; }
    .director-heading { font-family: var(--heading-font); font-size: clamp(17pt, 3vw, 23pt); line-height:0.95; letter-spacing:0.01em; margin-bottom:3pt; }
    .director-heading span { font-weight:900; text-transform:uppercase; }
    .director-heading em { font-family: Georgia, "Times New Roman", serif; font-size:0.76em; font-style:italic; font-weight:500; text-transform:none; letter-spacing:0; }
    .role-directorCorner .body { font-weight: 600; font-size: 9.1pt; line-height:1.18; }
    .role-happyHour .section-heading,
    .role-upcomingEvents .section-heading,
    .role-outingList .section-heading,
    .role-volunteerCallout .section-heading { font-size: clamp(13pt, 2.5vw, 19pt); }
    .role-happyHour .section-heading { margin-top: 7pt; }
    .role-happyHour .body,
    .role-upcomingEvents .body,
    .role-outingList .body,
    .role-volunteerCallout .body { font-size: 9.1pt; line-height:1.23; }
    .role-happyHour .list-body,
    .role-upcomingEvents .list-body,
    .role-outingList .list-body { font-size: 10pt; line-height:1.32; }
    .role-featureBand.panel { padding: 10px 14px; }
    .role-featureBand .script-heading,
    .role-featureBand .section-heading { font-size: clamp(14pt, 2.6vw, 20pt); text-transform:none; letter-spacing:0; }
    .role-featureBand .body { font-size: 9.2pt; font-weight: 600; line-height:1.18; }
    .role-spotlightRail.panel { padding: 10px 13px; }
    .role-spotlightRail .script-heading,
    .role-spotlightRail .section-heading { font-size: clamp(14pt, 2.4vw, 18pt); text-transform:none; letter-spacing:0; }
    .role-spotlightRail .body { font-size: 9.1pt; font-weight: 600; line-height:1.18; }
    .role-infoFooter.panel { padding: 8px 14px; }
    .role-infoFooter .script-heading,
    .role-infoFooter .section-heading { font-size: 18pt; text-transform:none; letter-spacing:0; margin-bottom:5pt; }
    .role-infoFooter .body { font-size: 8.1pt; font-weight: 600; line-height:1.12; }
  .pagefoot { margin-top: 0.05in; padding-top: 3pt; border-top: 2px solid; display:flex; justify-content:space-between; font-size: 7.2pt; letter-spacing: 0.1em; text-transform: uppercase; color:#666; }
  ${pageCss}
</style>
</head>
<body>
${pageSections}
</body>
</html>`;
}
