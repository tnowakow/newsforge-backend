/**
 * Server-rendered bare HTML page for Puppeteer to print. NOT user-facing.
 * Receives a fully hydrated run (with client, template, articles, images,
 * and assembledLayout) and emits a single HTML string.
 */
import type {
  AssembledLayout,
  Article,
  GridSpec,
  NewsImage,
  RecurringSection,
} from "@newsforge/shared/schemas";

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

export function renderRunHtml(input: RenderInput): string {
  const articlesById = new Map(input.articles.map((a) => [a.id, a]));
  const imagesById = new Map(input.images.map((i) => [i.id, i]));
  const sectionsById = new Map(
    input.recurringSections.map((s) => [s.id, s]),
  );

  const pages = new Map<number, string[]>();
  for (let p = 1; p <= input.layout.pageCount; p++) pages.set(p, []);

  const cols = input.gridSpec.columns;

  for (const b of input.layout.blocks) {
    const style =
      `grid-column: ${b.position.col} / span ${b.position.colSpan};` +
      `grid-row: ${b.position.row} / span ${b.position.rowSpan};`;
    let inner = "";

    if (b.kind === "article" || b.kind === "filler" || b.kind === "recurring") {
      const article = b.articleId ? articlesById.get(b.articleId) : undefined;
      const section = b.sectionId ? sectionsById.get(b.sectionId) : undefined;
      if (article) {
        inner = `
          <article class="block block-article ${b.styleTag ? "tag-" + esc(b.styleTag) : ""}">
            ${section ? `<div class="kicker">${esc(section.title)}</div>` : ""}
            <h2>${esc(article.title)}</h2>
            ${article.byline ? `<div class="byline">By ${esc(article.byline)}</div>` : ""}
            <div class="body">${article.body
              .split(/\n\n+/)
              .map((p) => `<p>${esc(p)}</p>`)
              .join("")}</div>
          </article>`;
      } else if (b.inlineText) {
        inner = `<article class="block block-filler"><p>${esc(b.inlineText)}</p></article>`;
      } else if (section) {
        inner = `<article class="block block-section"><h2>${esc(section.title)}</h2></article>`;
      }
    } else if (b.kind === "image") {
      const img = b.imageId ? imagesById.get(b.imageId) : undefined;
      if (img) {
        inner = `
          <figure class="block block-image">
            <img src="${esc(img.url)}" alt="${esc(img.alt ?? "")}" />
            ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
          </figure>`;
      } else {
        inner = `<div class="block block-image placeholder"><span>Image</span></div>`;
      }
    } else if (b.kind === "placeholder") {
      inner = `<div class="block block-placeholder"><span>${esc(b.inlineText ?? "Placeholder")}</span></div>`;
    } else {
      inner = `<div class="block block-empty"></div>`;
    }

    pages.get(b.page)?.push(`<div class="cell" style="${style}">${inner}</div>`);
  }

  const pageHtml: string[] = [];
  for (const [pageNum, cells] of pages) {
    pageHtml.push(`
      <section class="page" data-page="${pageNum}">
        <header class="masthead">
          ${input.brandKit.logoUrl ? `<img class="logo" src="${esc(input.brandKit.logoUrl)}" alt="" />` : ""}
          <div class="masthead-text">
            <div class="masthead-name">${esc(input.clientName)}</div>
            <div class="masthead-month">${esc(input.monthLabel)}</div>
          </div>
          <div class="masthead-page">Page ${pageNum} of ${input.layout.pageCount}</div>
        </header>
        <div class="grid" style="grid-template-columns: repeat(${cols}, 1fr);">
          ${cells.join("\n")}
        </div>
      </section>`);
  }

  const css = `
    :root {
      --primary: ${input.brandKit.primaryColor};
      --secondary: ${input.brandKit.secondaryColor};
      --accent: ${input.brandKit.accentColor};
      --heading-font: ${input.brandKit.headingFont}, "Georgia", serif;
      --body-font: ${input.brandKit.bodyFont}, "Helvetica", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #111;
      font-family: var(--body-font);
      font-size: 12pt;
      line-height: 1.45;
    }
    .page {
      width: 8.5in;
      min-height: 11in;
      padding: 0.6in 0.55in;
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }
    .page:last-child { page-break-after: auto; }
    .masthead {
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 3px solid var(--primary);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .masthead .logo { height: 56px; width: auto; }
    .masthead-name {
      font-family: var(--heading-font);
      font-size: 22pt;
      font-weight: 700;
      color: var(--primary);
    }
    .masthead-month {
      font-size: 10pt;
      color: var(--secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .masthead-page {
      margin-left: auto;
      font-size: 9pt;
      color: #666;
    }
    .grid {
      flex: 1;
      display: grid;
      grid-auto-rows: minmax(0.55in, auto);
      gap: 12px;
    }
    .cell { overflow: hidden; }
    .block { height: 100%; }
    h2 {
      font-family: var(--heading-font);
      color: var(--primary);
      font-size: 15pt;
      margin: 0 0 6px;
    }
    .kicker {
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .byline {
      font-size: 9pt; color: #666; margin-bottom: 6px; font-style: italic;
    }
    .body p { margin: 0 0 8px; }
    figure.block-image { margin: 0; }
    figure.block-image img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    figcaption { font-size: 9pt; color: #555; padding-top: 4px; }
    .block-placeholder, .block-image.placeholder {
      background: repeating-linear-gradient(45deg, #f3f3f3, #f3f3f3 8px, #eaeaea 8px, #eaeaea 16px);
      display: flex; align-items: center; justify-content: center;
      color: #888; font-size: 10pt; padding: 8px;
    }
    .block-empty { background: #fafafa; border: 1px dashed #ddd; }
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(input.clientName)} — ${esc(input.monthLabel)}</title>
<style>${css}</style>
</head>
<body>
${pageHtml.join("\n")}
</body>
</html>`;
}
