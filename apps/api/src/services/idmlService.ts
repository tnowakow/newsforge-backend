/**
 * v3 — basic IDML export ("Option A" / Minimum Viable IDML).
 *
 * IDML is Adobe's documented XML-in-zip interchange format; InDesign opens
 * it as a fully editable document. This service generates a minimal but
 * valid package from the layout model:
 *
 *   - two letter-size pages (the 11×17 inner spread, split as InDesign
 *     facing content: one spread per page for v3 simplicity)
 *   - a TextFrame per text/list block at exact grid geometry, panel fills
 *     as document swatches, brand Heading/Body/Caption paragraph styles
 *   - a Rectangle+Image per photo block with a Link into Links/
 *   - delivered as an outer zip: newsletter.idml + Links/ + README
 *
 * Fidelity bar (agreed): designer opens it, recognizes the layout, all
 * content present and editable; minor typographic drift acceptable.
 * Riley: golden-file validation in a real InDesign install is REQUIRED
 * before this ships to Porter One — see V3 instructions §QA.
 */
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
  ArticlesSchema,
  AssembledLayoutSchema,
  GridSpecSchema,
  ImagesSchema,
  type Article,
  type LayoutBlock,
  type NewsImage,
  type PanelToken,
} from "@newsforge/shared/schemas";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { resolveToken, DARK_TOKENS, type BrandColors } from "./designLanguage.js";

// ---------- geometry ----------
const PAGE_W = 612; // 8.5in in pt
const PAGE_H = 792; // 11in in pt
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2 - 54; // masthead strip reserve
const CONTENT_TOP = MARGIN + 54;
const GAP = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function blockRect(b: LayoutBlock, cols: number, rows: number): Rect {
  const cw = CONTENT_W / cols;
  const rh = CONTENT_H / rows;
  return {
    x: MARGIN + (b.position.col - 1) * cw + GAP / 2,
    y: CONTENT_TOP + (b.position.row - 1) * rh + GAP / 2,
    w: b.position.colSpan * cw - GAP,
    h: b.position.rowSpan * rh - GAP,
  };
}

// Spread coordinate space is centered on the page for single-page spreads.
function toSpread(r: Rect): Rect {
  return { x: r.x - PAGE_W / 2, y: r.y - PAGE_H / 2, w: r.w, h: r.h };
}

function pathPoints(r: Rect): string {
  const pts = [
    [r.x, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y],
  ];
  return pts
    .map(
      ([x, y]) =>
        `<PathPointType Anchor="${x} ${y}" LeftDirection="${x} ${y}" RightDirection="${x} ${y}"/>`,
    )
    .join("");
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `${r} ${g} ${b}`;
}

// ---------- package parts ----------
const MIMETYPE = "application/vnd.adobe.indesign-idml-package";

function designMap(spreadIds: string[], storyIds: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="18.0(55)" ?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0" Self="d">
  <idPkg:Graphic src="Resources/Graphic.xml"/>
  <idPkg:Fonts src="Resources/Fonts.xml"/>
  <idPkg:Styles src="Resources/Styles.xml"/>
  <idPkg:Preferences src="Resources/Preferences.xml"/>
  <idPkg:Tags src="XML/Tags.xml"/>
  <idPkg:MasterSpread src="MasterSpreads/MasterSpread_uMaster.xml"/>
${spreadIds.map((s) => `  <idPkg:Spread src="Spreads/Spread_${s}.xml"/>`).join("\n")}
  <idPkg:BackingStory src="XML/BackingStory.xml"/>
${storyIds.map((s) => `  <idPkg:Story src="Stories/Story_${s}.xml"/>`).join("\n")}
</Document>`;
}

function graphicXml(colors: Array<{ name: string; hex: string }>): string {
  const colorEls = colors
    .map(
      (c) =>
        `  <Color Self="Color/${c.name}" Model="Process" Space="RGB" ColorValue="${hexToRgbTriplet(c.hex)}" Name="${c.name}"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>
  <Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>
${colorEls}
  <Swatch Self="Swatch/None" Name="None"/>
</idPkg:Graphic>`;
}

function fontsXml(heading: string, body: string): string {
  const fam = (name: string) => `  <FontFamily Self="ff_${xmlEsc(name).replace(/\W+/g, "_")}" Name="${xmlEsc(name)}">
    <Font Self="f_${xmlEsc(name).replace(/\W+/g, "_")}" FontFamily="${xmlEsc(name)}" Name="${xmlEsc(name)} Regular" PostScriptName="${xmlEsc(name).replace(/\s+/g, "")}" FontStyleName="Regular" FontType="OpenTypeTT" Status="Substituted"/>
  </FontFamily>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
${fam(heading)}
${heading === body ? "" : fam(body)}
</idPkg:Fonts>`;
}

function stylesXml(heading: string, body: string): string {
  const ps = (name: string, font: string, size: number, leading: number, bold = false) =>
    `    <ParagraphStyle Self="ParagraphStyle/${name}" Name="${name}" AppliedFont="${xmlEsc(font)}" PointSize="${size}" Leading="${leading}"${bold ? ' FontStyle="Bold"' : ""} FillColor="Color/Black"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <RootCharacterStyleGroup Self="rcsg">
    <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/>
  </RootCharacterStyleGroup>
  <RootParagraphStyleGroup Self="rpsg">
    <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]"/>
    <ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle"/>
${ps("NF Heading", heading, 16, 18, true)}
${ps("NF Body", body, 9.5, 12)}
${ps("NF Caption", body, 8, 10)}
${ps("NF ListRow", body, 9, 12)}
  </RootParagraphStyleGroup>
</idPkg:Styles>`;
}

function preferencesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <DocumentPreference PageWidth="${PAGE_W}" PageHeight="${PAGE_H}" PagesPerDocument="2" FacingPages="false" DocumentBleedTopOffset="9" DocumentBleedBottomOffset="9" DocumentBleedInsideOrLeftOffset="9" DocumentBleedOutsideOrRightOffset="9"/>
  <ViewPreference HorizontalMeasurementUnits="Points" VerticalMeasurementUnits="Points"/>
</idPkg:Preferences>`;
}

function masterSpreadXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <MasterSpread Self="uMaster" Name="A-Master" NamePrefix="A" BaseName="Master" PageCount="1" ItemTransform="1 0 0 1 0 0">
    <Page Self="uMasterPage" Name="A" AppliedMaster="n" GeometricBounds="0 0 ${PAGE_H} ${PAGE_W}" ItemTransform="1 0 0 1 ${-PAGE_W / 2} ${-PAGE_H / 2}"/>
  </MasterSpread>
</idPkg:MasterSpread>`;
}

function tagsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Tags xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <XMLTag Self="XMLTag/Root" Name="Root"/>
</idPkg:Tags>`;
}

function backingStoryXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:BackingStory xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <XmlStory Self="uBacking" AppliedTOCStyle="n" UserText="true" IsEndnoteStory="false">
    <XMLElement Self="di2" MarkupTag="XMLTag/Root"/>
  </XmlStory>
</idPkg:BackingStory>`;
}

function storyXml(
  id: string,
  paragraphs: Array<{ style: string; text: string; colorName?: string }>,
): string {
  const ranges = paragraphs
    .map(
      (p) => `    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${p.style}">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"${p.colorName ? ` FillColor="Color/${p.colorName}"` : ""}>
        <Content>${xmlEsc(p.text)}</Content>
      </CharacterStyleRange>
      <Br/>
    </ParagraphStyleRange>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="${id}" UserText="true" IsEndnoteStory="false" StoryTitle="$ID/">
    <StoryPreference OpticalMarginAlignment="false" FrameType="TextFrameType"/>
${ranges}
  </Story>
</idPkg:Story>`;
}

// ---------- main ----------
export type IdmlResult =
  | { ok: true; zipPath: string; publicUrl: string; fileName: string }
  | { ok: false; status: 404 | 500; reason: string };

export async function buildIdmlPackage(runId: string): Promise<IdmlResult> {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    include: { client: true, template: true },
  });
  if (!run) return { ok: false, status: 404, reason: "run_not_found" };

  const layout = AssembledLayoutSchema.safeParse(run.assembledLayout);
  const articlesP = ArticlesSchema.safeParse(run.articles);
  const imagesP = ImagesSchema.safeParse(run.images);
  const gridP = GridSpecSchema.safeParse(run.template.gridSpec);
  if (!layout.success || !articlesP.success || !imagesP.success || !gridP.success) {
    return { ok: false, status: 500, reason: "run_state_invalid" };
  }
  const articles: Article[] = articlesP.data;
  const images: NewsImage[] = imagesP.data;
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const imageById = new Map(images.map((i) => [i.id, i]));
  const brand: BrandColors = {
    primaryColor: run.client.primaryColor,
    secondaryColor: run.client.secondaryColor,
    accentColor: run.client.accentColor,
  };

  // Collect swatches actually used.
  const usedTokens = new Set<PanelToken>();
  for (const b of layout.data.blocks) {
    if (b.style?.bg) usedTokens.add(b.style.bg);
    if (b.style?.headerColor) usedTokens.add(b.style.headerColor);
  }
  const swatches = [...usedTokens]
    .filter((t) => t !== "paper")
    .map((t) => ({ name: `nf_${t}`, hex: resolveToken(t, brand) }));

  const idml = new JSZip();
  // Per spec: mimetype first, stored uncompressed.
  idml.file("mimetype", MIMETYPE, { compression: "STORE" });

  const storyFiles: Array<{ id: string; xml: string }> = [];
  const links: Array<{ zipName: string; diskPath?: string; remoteUrl?: string }> = [];
  const spreadXmlByPage = new Map<number, string[]>();
  let u = 100;

  const pages = [...new Set(layout.data.blocks.map((b) => b.page))].sort();
  for (const page of pages) spreadXmlByPage.set(page, []);

  for (const b of layout.data.blocks) {
    if (b.kind === "empty") continue;
    const rect = toSpread(blockRect(b, gridP.data.columns, gridP.data.rowsPerPage));
    const frags = spreadXmlByPage.get(b.page)!;
    const fillAttr =
      b.style?.bg && b.style.bg !== "paper"
        ? ` FillColor="Color/nf_${b.style.bg}"`
        : "";

    if (b.kind === "image" && b.imageId) {
      const img = imageById.get(b.imageId);
      if (!img) continue;
      u += 1;
      const rectSelf = `u${u}`;
      const isLocal = img.url.startsWith("/uploads/");
      const base = path.basename(img.url.split("?")[0]) || `${b.blockId}.jpg`;
      const zipName = `${b.blockId}-${base}`;
      if (isLocal) {
        links.push({
          zipName,
          diskPath: path.join(env.UPLOAD_DIR, img.url.replace(/^\/uploads\//, "")),
        });
      } else {
        links.push({ zipName, remoteUrl: img.url });
      }
      const uri = `file:Links/${zipName}`;
      frags.push(`    <Rectangle Self="${rectSelf}" ContentType="GraphicType" StrokeWeight="0" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${pathPoints(rect)}</PathPointArray></GeometryPathType></PathGeometry></Properties>
      <FrameFittingOption FittingOnEmptyFrame="FillProportionally"/>
      <Image Self="${rectSelf}img" ItemTransform="1 0 0 1 ${rect.x} ${rect.y}">
        <Properties><Profile type="string">$ID/Embedded</Profile></Properties>
        <Link Self="${rectSelf}lnk" LinkResourceURI="${xmlEsc(uri)}"/>
      </Image>
    </Rectangle>`);
      // Caption frame under the image (small strip).
      if (b.caption) {
        u += 1;
        const capStory = `u${u}s`;
        storyFiles.push({
          id: capStory,
          xml: storyXml(capStory, [{ style: "NF Caption", text: b.caption }]),
        });
        const capRect: Rect = { x: rect.x, y: rect.y + rect.h + 2, w: rect.w, h: 14 };
        frags.push(textFrameFragment(`u${u}f`, capStory, capRect, ""));
      }
      continue;
    }

    // Text-bearing block → story + text frame.
    u += 1;
    const storyId = `u${u}s`;
    const frameId = `u${u}f`;
    const paragraphs: Array<{ style: string; text: string; colorName?: string }> = [];
    const headerColor = b.style?.headerColor
      ? `nf_${b.style.headerColor}`
      : undefined;

    if (b.heading) {
      paragraphs.push({ style: "NF Heading", text: b.heading, colorName: headerColor });
    }
    if (b.kind === "list" && b.listItems?.length) {
      for (const item of b.listItems) {
        paragraphs.push({
          style: "NF ListRow",
          text: item.isGroupHeader
            ? item.label
            : item.value
            ? `${item.label}\t${item.value}`
            : item.label,
        });
      }
    } else {
      const article = b.articleId ? articleById.get(b.articleId) : undefined;
      const bodyText = article?.body ?? b.inlineText ?? "";
      if (!b.heading && article?.title) {
        paragraphs.push({ style: "NF Heading", text: article.title, colorName: headerColor });
      }
      for (const para of bodyText.split(/\n{2,}|\n/).filter((t) => t.trim())) {
        paragraphs.push({ style: "NF Body", text: para.trim() });
      }
    }
    if (paragraphs.length === 0) continue;

    storyFiles.push({ id: storyId, xml: storyXml(storyId, paragraphs) });
    frags.push(textFrameFragment(frameId, storyId, rect, fillAttr));
  }

  // Spreads (one page per spread — v3 simplicity; see instructions §IDML).
  const spreadIds: string[] = [];
  let spreadIdx = 0;
  for (const page of pages) {
    spreadIdx += 1;
    const sid = `uS${spreadIdx}`;
    spreadIds.push(sid);
    idml.file(
      `Spreads/Spread_${sid}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Spread Self="${sid}" PageCount="1" BindingLocation="0" ItemTransform="1 0 0 1 0 ${(spreadIdx - 1) * (PAGE_H + 24)}">
    <Page Self="${sid}p" Name="${page}" AppliedMaster="uMaster" GeometricBounds="0 0 ${PAGE_H} ${PAGE_W}" ItemTransform="1 0 0 1 ${-PAGE_W / 2} ${-PAGE_H / 2}"/>
${(spreadXmlByPage.get(page) ?? []).join("\n")}
  </Spread>
</idPkg:Spread>`,
    );
  }

  idml.file("designmap.xml", designMap(spreadIds, storyFiles.map((s) => s.id)));
  idml.file("Resources/Graphic.xml", graphicXml(swatches));
  idml.file("Resources/Fonts.xml", fontsXml(run.client.headingFont, run.client.bodyFont));
  idml.file("Resources/Styles.xml", stylesXml(run.client.headingFont, run.client.bodyFont));
  idml.file("Resources/Preferences.xml", preferencesXml());
  idml.file("MasterSpreads/MasterSpread_uMaster.xml", masterSpreadXml());
  idml.file("XML/Tags.xml", tagsXml());
  idml.file("XML/BackingStory.xml", backingStoryXml());
  for (const s of storyFiles) idml.file(`Stories/Story_${s.id}.xml`, s.xml);

  const idmlBuffer = await idml.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  // Outer package zip: newsletter.idml + Links/ + README.
  const pkg = new JSZip();
  pkg.file("newsletter.idml", idmlBuffer);
  const remoteNotes: string[] = [];
  for (const link of links) {
    if (link.diskPath) {
      try {
        pkg.file(`Links/${link.zipName}`, await fs.readFile(link.diskPath));
      } catch {
        remoteNotes.push(`- Links/${link.zipName}: source file missing on server`);
      }
    } else if (link.remoteUrl) {
      remoteNotes.push(`- Links/${link.zipName}: remote image, relink from ${link.remoteUrl}`);
    }
  }
  pkg.file(
    "README.txt",
    [
      `NewsForge IDML package — run ${run.id} (${run.client.name}, ${run.monthLabel})`,
      ``,
      `Open newsletter.idml in Adobe InDesign. Image frames link to the Links/ folder;`,
      `keep it beside the .idml (or relink via Links panel). Fonts are declared as the`,
      `client brand fonts and will substitute if not installed.`,
      remoteNotes.length ? `\nRelink notes:\n${remoteNotes.join("\n")}` : ``,
    ].join("\n"),
  );

  const fileName = `newsforge-${run.id}-v${run.layoutVersion}.idml.zip`;
  const zipPath = path.join(env.PDF_DIR, fileName);
  await fs.writeFile(
    zipPath,
    await pkg.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  return { ok: true, zipPath, publicUrl: `/pdfs/${fileName}`, fileName };
}

function textFrameFragment(
  frameId: string,
  storyId: string,
  rect: Rect,
  fillAttr: string,
): string {
  return `    <TextFrame Self="${frameId}" ParentStory="${storyId}" ContentType="TextType" StrokeWeight="0"${fillAttr} ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${pathPoints(rect)}</PathPointArray></GeometryPathType></PathGeometry></Properties>
      <TextFramePreference TextColumnCount="1" InsetSpacing="6 6 6 6"/>
    </TextFrame>`;
}
