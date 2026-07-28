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

function renderBlock(input: RenderInput, b: LayoutBlock): string {
  const articlesById = new Map(input.articles.map((a) => [a.id, a]));
  const imagesById = new Map(input.images.map((i) => [i.id, i]));
  const sectionsById = new Map(input.recurringSections.map((s) => [s.id, s]));

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
    b.style?.scriptHeading
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
    const article = b.articleId ? articlesById.get(b.articleId) : undefined;
    const section = b.sectionId ? sectionsById.get(b.sectionId) : undefined;
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

  return `<div class="block${roleClass(b)}" style="${outerStyle}"><div class="block-inner${bg ? " panel" : ""}${roleClass(b)}" style="${panelStyle}">${inner}</div></div>`;
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
  for (let p = 1; p <= input.layout.pageCount; p++) pages.set(p, []);
  for (const b of input.layout.blocks) {
    if (!pages.has(b.page)) pages.set(b.page, []);
    pages.get(b.page)!.push(renderBlock(input, b));
  }

  const pageSections = [...pages.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([page, blocks]) => `
    <section class="page" data-page="${page}">
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
    padding: 0.42in 0.42in 0.5in;
    page-break-after: always; overflow: hidden;
    display: flex; flex-direction: column;
  }
    .masthead { margin-bottom: 0.12in; font-family: var(--heading-font); display:flex; align-items:center; gap:12px; min-height:44px; }
    .masthead .logo { max-height:40px; max-width:118px; object-fit:contain; }
    .masthead .kicker { font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; }
  .masthead h1 { font-size: 26pt; line-height: 1.05; margin-top: 2pt; }
  .masthead.slim { display:flex; justify-content:space-between; font-size:8pt; letter-spacing:0.14em; text-transform:uppercase; color:#777; margin-bottom:0.12in; }
  .content { flex:1; display:grid; gap: 6px; }
  .block { min-height: 0; min-width: 0; display:flex; }
  .block-inner { flex:1; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
    .block-inner.panel { padding: 9px 11px; }
    .section-heading { font-family: var(--heading-font); font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-size: 15pt; line-height:1.02; margin-bottom: 4pt; text-align:center; }
    .script-heading { font-family: var(--heading-font); font-style: italic; font-weight: 800; font-size: 16pt; line-height:1.05; margin-bottom: 5pt; }
    .byline { font-size: 7.5pt; color: inherit; opacity:0.7; margin-bottom: 3pt; }
    .body { font-size: 8.6pt; line-height: 1.38; }
    .body.compact { font-size: 8pt; line-height: 1.28; }
    .body p + p { margin-top: 4pt; }
    .body.centered { text-align:center; }
  .list-body { font-size: 8.4pt; line-height: 1.5; }
  .list-group { font-weight: 800; letter-spacing: 0.12em; font-size: 7.6pt; margin: 5pt 0 2pt; opacity: 0.85; }
  .list-row { display:flex; justify-content:space-between; gap: 8px; border-bottom: 1px dotted rgba(0,0,0,0.12); padding: 1pt 0; }
  .block-inner[style*="color:#F7F5EF"] .list-row { border-bottom-color: rgba(255,255,255,0.25); }
  .list-label { font-weight: 600; }
  .photo { flex:1; display:flex; flex-direction:column; min-height:0; }
    .photo-frame { flex:1; min-height:0; overflow:hidden; border-radius: 8px; }
    .photo-frame img { width:100%; height:100%; object-fit:cover; display:block; }
    .photo figcaption { font-size: 7.4pt; font-style: italic; text-align:center; padding-top: 3pt; color:#555; }
    .photo-collage .photo-frame { border-radius: 10px; }
    .photo-wide .photo-frame { border-radius: 12px; }
    .photo-portrait .photo-frame { border-radius: 12px; }
    .role-birthday {
      background-image: radial-gradient(circle, rgba(21,27,43,0.22) 0 2px, transparent 2.4px);
      background-size: 18px 18px;
    }
    .role-birthday.panel { padding: 17px 19px 10px; border-bottom: 8px solid #D85C2A; }
    .role-birthday .script-heading { font-size: 20pt; text-align:left; }
    .role-birthday .list-body { font-size: 10.5pt; line-height: 1.35; }
    .role-birthday .list-group { color:#D85C2A; font-size: 10pt; margin-top: 8pt; }
    .role-birthday .list-row { border-bottom: 0; }
    .role-directorCorner.panel { padding: 17px 20px; }
    .role-directorCorner .script-heading { font-size: 23pt; font-style: normal; text-transform: uppercase; letter-spacing:0.02em; }
    .role-directorCorner .body { font-weight: 700; font-size: 10pt; line-height:1.24; }
    .role-happyHour .section-heading,
    .role-upcomingEvents .section-heading,
    .role-outingList .section-heading,
    .role-volunteerCallout .section-heading { font-size: 19pt; }
    .role-happyHour .body,
    .role-upcomingEvents .body,
    .role-outingList .body,
    .role-volunteerCallout .body { font-size: 9.1pt; line-height:1.23; }
    .role-happyHour .list-body,
    .role-upcomingEvents .list-body,
    .role-outingList .list-body { font-size: 10pt; line-height:1.32; }
    .role-featureBand.panel { padding: 16px 22px; }
    .role-featureBand .script-heading,
    .role-featureBand .section-heading { font-size: 20pt; text-transform:none; letter-spacing:0; }
    .role-featureBand .body { font-size: 10pt; font-weight: 700; line-height:1.25; }
    .role-spotlightRail.panel { padding: 17px 20px; }
    .role-spotlightRail .script-heading,
    .role-spotlightRail .section-heading { font-size: 18pt; text-transform:none; letter-spacing:0; }
    .role-spotlightRail .body { font-size: 10pt; font-weight: 700; line-height:1.26; }
    .role-infoFooter.panel { padding: 14px 22px; }
    .role-infoFooter .script-heading,
    .role-infoFooter .section-heading { font-size: 18pt; text-transform:none; letter-spacing:0; margin-bottom:5pt; }
    .role-infoFooter .body { font-size: 8.6pt; font-weight: 700; line-height:1.22; }
    .pagefoot { margin-top: 0.08in; padding-top: 4pt; border-top: 2px solid; display:flex; justify-content:space-between; font-size: 7.4pt; letter-spacing: 0.1em; text-transform: uppercase; color:#666; }
</style>
</head>
<body>
${pageSections}
</body>
</html>`;
}
