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

function isTrilogy(input: RenderInput): boolean {
  return input.clientName.toLowerCase().includes("trilogy");
}

function articleText(article: Article | undefined, maxChars = 650): string {
  const text = article?.body?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).replace(/\s+\S*$/, "")}.`;
}

function fillClass(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words <= 35) return "fill-xl";
  if (words <= 70) return "fill-lg";
  if (words <= 115) return "fill-md";
  return "fill-tight";
}

function articleTextClass(article: Article | undefined, maxChars: number): string {
  return fillClass(articleText(article, maxChars));
}

function articleByTitle(input: RenderInput, pattern: RegExp): Article | undefined {
  return input.articles.find((article) => pattern.test(article.title));
}

function imageAt(input: RenderInput, index: number): NewsImage | undefined {
  return input.images[index % Math.max(1, input.images.length)];
}

function imgTag(input: RenderInput, index: number, className = ""): string {
  const img = imageAt(input, index);
  if (!img) return "";
  return `<img class="${className}" src="${esc(img.url)}" alt="${esc(img.alt ?? "")}" />`;
}

function birthdayList(): string {
  return `
    <div class="birthday-list">
      <div class="label">RESIDENTS</div>
      <span>Mary Ann F.</span><span>7/3</span>
      <span>Shirley S.</span><span>7/10</span>
      <span>Janice F.</span><span>7/22</span>
      <span>Michael V.</span><span>7/27</span>
      <span>Joan C.</span><span>7/31</span>
      <div class="label">STAFF</div>
      <span>Erica M.</span><span>7/1</span>
      <span>Grace C.</span><span>7/8</span>
      <span>Morgan C.</span><span>7/20</span>
      <span>Kimberly H.</span><span>7/21</span>
      <span>Alena O.</span><span>7/25</span>
    </div>`;
}

function eventList(): string {
  return `
    <div class="event-list">
      <p><b>July 3:</b> Red, White & Blue Happy Hour</p>
      <p><b>July 10:</b> Cruisin' Through Happy Hour</p>
      <p><b>July 17:</b> Ink & Drink Patio Social</p>
      <p><b>July 24:</b> Gorgeous Grandma Day</p>
      <p><b>July 31:</b> Surf's Up Summer Sendoff</p>
    </div>`;
}

function calendarGrid(): string {
  return `
    <div class="calendar-grid">
      <b>7/2</b><span>Sugar Shack by the Tracks</span>
      <b>7/21</b><span>Ford's Garage</span>
      <b>7/7</b><span>Newport Aquarium</span>
      <b>7/23</b><span>Washington Park Picnic</span>
      <b>7/9</b><span>Fishing Trip and Pizza</span>
      <b>7/28</b><span>Flub's Ice Cream</span>
      <b>7/14</b><span>Meijer Shopping Trip</span>
      <b>7/30</b><span>Bluebird Bakery</span>
    </div>`;
}

function renderTrilogyFeaturePage(input: RenderInput, pageNum: number): string {
  const director = articleByTitle(input, /director/i);
  const feature = articleByTitle(input, /uv|skin|feature/i);
  const staff = input.articles.filter((article) =>
    /Ben|Kim|Lindsay|staff|spotlight|smile/i.test(article.title),
  );
  const campus = articleByTitle(input, /campus|calendar|highlight|color/i);
  const wellness = articleByTitle(input, /wellness|best friends|legacy|memory/i);

  if (pageNum === 2) {
    return `
      <section class="page trilogy-rich trilogy-p2" data-page="2">
        <aside class="module birthday-card" style="grid-column:1 / span 4; grid-row:1 / span 7;">
          <h2>Happy Birthday!</h2>
          ${birthdayList()}
        </aside>
        <article class="module director-card" style="grid-column:5 / span 8; grid-row:1 / span 7;">
          <h2>Executive Director <em>Corner</em></h2>
          ${imgTag(input, 4)}
          <div class="body-copy ${articleTextClass(director, 820)}">${esc(articleText(director, 820))}</div>
        </article>
        <article class="module event-card" style="grid-column:1 / span 6; grid-row:8 / span 4;">
          <h3>Happy Hour</h3>
          ${eventList()}
        </article>
        <article class="module feature-card" style="grid-column:7 / span 6; grid-row:8 / span 4;">
          <h3>Upcoming Events</h3>
          <p class="body-copy ${articleTextClass(campus, 700)}">${esc(articleText(campus, 700))}</p>
        </article>
        <div class="module photo-row" style="grid-column:1 / span 12; grid-row:12 / span 5;">
          ${imgTag(input, 0)}${imgTag(input, 1)}${imgTag(input, 2)}
        </div>
      </section>`;
  }

  return `
    <section class="page trilogy-rich trilogy-p3" data-page="3">
      <div class="module photo-stack" style="grid-column:1 / span 3; grid-row:1 / span 6; padding:0; display:grid; gap:0.1in;">
        ${imgTag(input, 3)}${imgTag(input, 4)}
      </div>
      <article class="module" style="grid-column:4 / span 6; grid-row:1 / span 6; text-align:center;">
        <h2 style="color:#d95a31; font-size:18pt;">Out and About</h2>
        <p class="body-copy serif ${articleTextClass(campus, 520)}">${esc(articleText(campus, 520))}</p>
        ${calendarGrid()}
      </article>
      <aside class="module purple-side" style="grid-column:10 / span 3; grid-row:1 / span 11;">
        <h3>Smile of the Month</h3>
        <p class="small ${articleTextClass(staff[0] ?? director, 520)}">${esc(articleText(staff[0] ?? director, 520))}</p>
        <p class="small ${articleTextClass(staff[1], 420)}" style="margin-top:0.08in;">${esc(articleText(staff[1], 420))}</p>
        <p class="small ${articleTextClass(staff[2], 420)}" style="margin-top:0.08in;">${esc(articleText(staff[2], 420))}</p>
      </aside>
      <article class="module blue-band" style="grid-column:1 / span 9; grid-row:7 / span 3;">
        <h3>${esc(feature?.title ?? "Scrubbly Bubbly Car Wash")}</h3>
        <p class="small ${articleTextClass(feature, 760)}">${esc(articleText(feature, 760))}</p>
        <p class="small fill-lg" style="margin-top:0.05in;">Use sunscreen daily, seek shade during peak afternoon hours, keep water nearby, and check the forecast before longer outdoor visits.</p>
      </article>
      <div class="module" style="grid-column:1 / span 3; grid-row:10 / span 3; padding:0;">
        ${imgTag(input, 5, "hero-photo")}
      </div>
      <article class="module green-head" style="grid-column:4 / span 6; grid-row:10 / span 3; text-align:center;">
        <h3>Make the Difference</h3>
        <p class="small serif ${articleTextClass(wellness, 620)}">${esc(articleText(wellness, 620))}</p>
      </article>
      <article class="module dark-band" style="grid-column:1 / span 12; grid-row:13 / span 4;">
        <h3>Trust Funds</h3>
        <p class="small fill-md">A resident trust fund can make outings, snacks, and special campus experiences easier to manage while keeping spending organized. Families can stop by the business office with questions or to set up support for an upcoming activity. This is especially helpful for ice cream trips, community outings, craft supplies, and small purchases that help residents participate without extra coordination on event day.</p>
      </article>
    </section>`;
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
    const tagClass = b.styleTag ? ` tag-${esc(b.styleTag)}` : "";
    let inner = "";

    if (b.kind === "article" || b.kind === "filler" || b.kind === "recurring") {
      const article = b.articleId ? articlesById.get(b.articleId) : undefined;
      const section = b.sectionId ? sectionsById.get(b.sectionId) : undefined;
      if (article) {
        inner = `
          <article class="block block-article${tagClass}">
            ${section ? `<div class="kicker">${esc(section.title)}</div>` : ""}
            <h2>${esc(article.title)}</h2>
            ${article.byline ? `<div class="byline">By ${esc(article.byline)}</div>` : ""}
            <div class="body">${article.body
              .split(/\n\n+/)
              .map((p) => `<p>${esc(p)}</p>`)
              .join("")}</div>
          </article>`;
      } else if (b.inlineText) {
        inner = `<article class="block block-filler${tagClass}"><p>${esc(b.inlineText)}</p></article>`;
      } else if (section) {
        inner = `<article class="block block-section${tagClass}"><h2>${esc(section.title)}</h2></article>`;
      }
    } else if (b.kind === "image") {
      const img = b.imageId ? imagesById.get(b.imageId) : undefined;
      if (img) {
        inner = `
          <figure class="block block-image${tagClass}">
            <img src="${esc(img.url)}" alt="${esc(img.alt ?? "")}" />
            ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
          </figure>`;
      } else {
        inner = `<div class="block block-image placeholder${tagClass}"><span>Image</span></div>`;
      }
    } else if (b.kind === "placeholder") {
      inner = `<div class="block block-placeholder${tagClass}"><span>${esc(b.inlineText ?? "Placeholder")}</span></div>`;
    } else {
      inner = `<div class="block block-empty"></div>`;
    }

    pages.get(b.page)?.push(`<div class="cell" style="${style}">${inner}</div>`);
  }

  const pageHtml: string[] = [];
  for (const [pageNum, cells] of pages) {
    if (isTrilogy(input) && (pageNum === 2 || pageNum === 3)) {
      pageHtml.push(renderTrilogyFeaturePage(input, pageNum));
      continue;
    }
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
      font-size: 10.5pt;
      line-height: 1.32;
    }
    @page { size: Letter; margin: 0; }
    .page {
      width: 8.5in;
      height: 11in;
      padding: 0.45in 0.42in;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
      grid-template-rows: repeat(10, minmax(0, 1fr));
      gap: 10px;
      min-height: 0;
    }
    .cell { overflow: hidden; min-width: 0; min-height: 0; }
    .block { height: 100%; overflow: hidden; }
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
    .tag-hero, .tag-feature, .tag-cover {
      background: color-mix(in srgb, var(--primary) 7%, white);
      border-left: 5px solid var(--primary);
      padding: 10px;
    }
    article.tag-hero h2, article.tag-feature h2, article.tag-cover h2 {
      font-size: 21pt;
      line-height: 1.08;
    }
    .tag-banner, .tag-recap {
      border-top: 3px solid var(--secondary);
      border-bottom: 1px solid var(--secondary);
      padding: 8px 0;
    }
    .tag-pull-quote, .tag-pullquote {
      background: color-mix(in srgb, var(--accent) 10%, white);
      border-radius: 4px;
      padding: 10px;
    }
    article.tag-pull-quote h2, article.tag-pullquote h2 {
      font-size: 18pt;
      font-style: italic;
    }
    .tag-spotlight, .tag-staff-spot, .tag-portrait, .tag-hero-portrait {
      border: 1px solid color-mix(in srgb, var(--secondary) 45%, white);
      border-radius: 4px;
      padding: 8px;
    }
    article.tag-staff-spot h2 {
      font-size: 12pt;
      line-height: 1.05;
      margin-bottom: 4px;
    }
    article.tag-staff-spot .body {
      font-size: 8.8pt;
      line-height: 1.18;
    }
    article.tag-director-corner .body {
      font-size: 10pt;
      line-height: 1.25;
    }
    .tag-panorama img, .tag-hero img, .tag-cover img {
      filter: saturate(1.04) contrast(1.03);
    }
    .trilogy-rich {
      padding: 0.22in 0.24in;
      font-family: "Georgia", var(--body-font);
      color: #1a1a1a;
    }
    .trilogy-rich h2,
    .trilogy-rich h3 {
      margin: 0;
      line-height: 0.95;
      text-transform: uppercase;
      letter-spacing: 0;
      font-family: "Arial", "Helvetica", sans-serif;
      font-weight: 900;
    }
    .trilogy-rich p { margin: 0; }
    .trilogy-rich .small { font-size: 7.8pt; line-height: 1.12; }
    .trilogy-rich .body-copy { font-size: 8.2pt; line-height: 1.13; }
    .trilogy-rich .fill-xl { font-size: 10pt; line-height: 1.22; }
    .trilogy-rich .fill-lg { font-size: 9.3pt; line-height: 1.2; }
    .trilogy-rich .fill-md { font-size: 8.7pt; line-height: 1.17; }
    .trilogy-rich .fill-tight { font-size: 7.8pt; line-height: 1.12; }
    .trilogy-rich .body-copy.fill-xl { font-size: 10.4pt; line-height: 1.22; }
    .trilogy-rich .body-copy.fill-lg { font-size: 9.7pt; line-height: 1.2; }
    .trilogy-rich .body-copy.fill-md { font-size: 9pt; line-height: 1.17; }
    .trilogy-rich .small.fill-xl { font-size: 9.4pt; line-height: 1.2; }
    .trilogy-rich .small.fill-lg { font-size: 8.8pt; line-height: 1.18; }
    .trilogy-rich .small.fill-md { font-size: 8.3pt; line-height: 1.15; }
    .trilogy-rich .serif { font-family: Georgia, serif; }
    .trilogy-rich .italic { font-style: italic; }
    .trilogy-p2,
    .trilogy-p3 {
      display: grid;
      gap: 0.12in;
      grid-template-columns: repeat(12, 1fr);
      grid-template-rows: repeat(16, 1fr);
    }
    .module {
      overflow: hidden;
      border-radius: 0.05in;
      padding: 0.1in;
      min-width: 0;
      min-height: 0;
    }
    .birthday-card {
      background: #dff21f;
      border-bottom: 0.08in solid #d95a31;
    }
    .birthday-card h2 {
      font-family: Georgia, serif;
      font-style: italic;
      text-transform: none;
      font-size: 17pt;
      color: #18202a;
      margin-bottom: 0.08in;
    }
    .birthday-list {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 0.12in;
      font-size: 9.8pt;
      line-height: 1.24;
    }
    .birthday-list .label {
      grid-column: 1 / -1;
      color: #d3542c;
      font-family: Arial, sans-serif;
      font-weight: 900;
      font-size: 9pt;
      margin: 0.04in 0 0.02in;
    }
    .director-card {
      background: #fbf3d8;
      border-radius: 0.14in;
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 0.12in;
    }
    .director-card h2 {
      grid-column: 1 / -1;
      color: #202226;
      font-size: 19pt;
    }
    .director-card h2 em {
      font-family: Georgia, serif;
      text-transform: none;
      font-weight: 700;
    }
    .director-card img {
      width: 100%;
      aspect-ratio: 1 / 1.18;
      object-fit: cover;
      border-radius: 0.12in;
      border: 0.04in solid #5164a9;
    }
    .director-card .body-copy {
      font-family: Arial, sans-serif;
      font-weight: 700;
      font-size: 9pt;
      line-height: 1.17;
    }
    .event-card h3 {
      font-size: 16pt;
      color: #5a62b5;
      text-align: center;
      margin-bottom: 0.05in;
    }
    .event-list {
      font-size: 9.2pt;
      line-height: 1.23;
      text-align: center;
    }
    .event-list b { color: #4f67bf; }
    .feature-card {
      text-align: center;
      border-top: 0.02in solid #777;
    }
    .feature-card h3 {
      color: #d5663c;
      font-size: 18pt;
      margin-bottom: 0.04in;
    }
    .feature-card .body-copy {
      font-size: 8.8pt;
      line-height: 1.17;
    }
    .photo-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.1in;
      padding: 0;
    }
    .photo-row img,
    .photo-stack img,
    .hero-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 0.08in;
    }
    .blue-band {
      background: #76c4e4;
      text-align: center;
      font-family: Georgia, serif;
      font-weight: 700;
    }
    .blue-band h3 {
      font-family: Georgia, serif;
      text-transform: none;
      color: #111827;
      font-size: 17pt;
      margin-bottom: 0.03in;
    }
    .green-head h3 {
      color: #83ae68;
      font-size: 17pt;
      text-align: center;
      margin-bottom: 0.03in;
    }
    .purple-side {
      background: #d5a6d7;
      text-align: center;
      font-family: Georgia, serif;
      font-weight: 700;
    }
    .purple-side h3 {
      font-family: Georgia, serif;
      text-transform: none;
      font-style: italic;
      font-size: 17pt;
      color: #101827;
      margin-bottom: 0.05in;
    }
    .dark-band {
      background: #111827;
      color: white;
      text-align: center;
      font-family: Georgia, serif;
      font-weight: 700;
    }
    .dark-band h3 {
      font-family: Georgia, serif;
      text-transform: none;
      color: white;
      font-size: 17pt;
      margin-bottom: 0.04in;
    }
    .calendar-grid {
      display: grid;
      grid-template-columns: 0.55fr 1fr 0.55fr 1fr;
      gap: 0.03in 0.08in;
      font-size: 8.6pt;
      line-height: 1.15;
    }
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
