import crypto from "node:crypto";
import { prisma } from "../db.js";
import { parseJson } from "../util/validate.js";
import {
  AssembledLayoutSchema,
  TemplateSlotsSchema,
  GridSpecSchema,
  ArticleArraySchema,
  ImageRefArraySchema,
  CompatibilityHintsSchema,
  type AssembledLayout,
  type Article,
  type ImageRef,
  type LayoutBlock,
  type TemplateSlot,
  type GridSpec,
  type LayoutPage,
  type FillerMode,
} from "@newsforge/shared";

function blockId(seed: string, idx: number): string {
  return `blk_${crypto.createHash("sha1").update(`${seed}|${idx}`).digest("hex").slice(0, 10)}`;
}

/**
 * Assemble a layout: walk each template slot, attach an appropriate content ref,
 * fill remaining slots with placeholders OR generated filler captions depending on fillerMode.
 * Vitaly §6.4: deterministic per (runId or clientId+monthLabel).
 */
export async function assembleLayout(opts: {
  runIdSeed: string;
  templateId: string;
  articles: Article[];
  images: ImageRef[];
  fillerMode: FillerMode;
}): Promise<AssembledLayout> {
  const template = await prisma.template.findUnique({ where: { id: opts.templateId } });
  if (!template) throw new Error(`Template not found: ${opts.templateId}`);

  const slots = parseJson(TemplateSlotsSchema, template.slotTypes);
  const grid = parseJson(GridSpecSchema, template.gridSpec);
  // Validate compatibility hints exist (Vitaly §5 R4).
  parseJson(CompatibilityHintsSchema, template.compatibilityHints);

  const articles = ArticleArraySchema.parse(opts.articles);
  const images = ImageRefArraySchema.parse(opts.images);

  // Cursors so we round-robin through available content.
  let aCursor = 0;
  let iCursor = 0;
  const nextArticle = () => (articles.length === 0 ? undefined : articles[aCursor++ % articles.length]);
  const nextImage = () => (images.length === 0 ? undefined : images[iCursor++ % images.length]);

  // Group slots by page.
  const byPage = new Map<number, TemplateSlot[]>();
  for (const s of slots) {
    const list = byPage.get(s.page) ?? [];
    list.push(s);
    byPage.set(s.page, list);
  }

  const pages: LayoutPage[] = [];
  let blockIdx = 0;
  const sortedPageNumbers = Array.from(byPage.keys()).sort((a, b) => a - b);

  for (const pageNumber of sortedPageNumbers) {
    const slotsOnPage = byPage.get(pageNumber)!;
    const blocks: LayoutBlock[] = slotsOnPage.map((slot) => {
      const content = pickContentForSlot(
        slot,
        nextArticle,
        nextImage,
        opts.fillerMode,
        opts.runIdSeed,
        blockIdx,
      );
      const { x, y } = anchorForSlot(slot, grid, blockIdx);
      const w = clampSize(slot.wMin, slot.wMax, grid.columns);
      const h = clampSize(slot.hMin, slot.hMax, grid.rowsPerPage);
      const out: LayoutBlock = {
        id: blockId(opts.runIdSeed, blockIdx++),
        type: slot.type,
        x,
        y,
        w,
        h,
        contentRef: content,
      };
      return out;
    });
    pages.push({
      pageNumber,
      template: { gridCols: grid.columns, gridRows: grid.rowsPerPage },
      blocks,
    });
  }

  const layout: AssembledLayout = { schemaVersion: 1, pages };
  // Validate end-to-end before returning so a bad shape can never escape this boundary.
  return AssembledLayoutSchema.parse(layout);
}

function clampSize(min: number, max: number, hardMax: number): number {
  const cap = Math.min(max, hardMax);
  return Math.max(min, Math.min(cap, hardMax));
}

function anchorForSlot(
  slot: TemplateSlot,
  grid: GridSpec,
  idx: number,
): { x: number; y: number } {
  if (slot.x !== undefined && slot.y !== undefined) {
    return { x: slot.x, y: slot.y };
  }
  // Default: stagger anchors so blocks don't all stack on (0,0).
  const x = (idx * 3) % grid.columns;
  const y = (idx * 2) % grid.rowsPerPage;
  return { x, y };
}

function pickContentForSlot(
  slot: TemplateSlot,
  nextArticle: () => Article | undefined,
  nextImage: () => ImageRef | undefined,
  fillerMode: FillerMode,
  seed: string,
  idx: number,
): LayoutBlock["contentRef"] {
  switch (slot.type) {
    case "masthead":
      return {
        kind: "placeholder",
        inline: { title: "MASTHEAD", caption: "Generated at render time from brand kit." },
      };
    case "footer":
      return {
        kind: "placeholder",
        inline: { caption: "Newsletter footer — community contact info." },
      };
    case "headline": {
      const a = nextArticle();
      if (a) return { kind: "article", id: a.id };
      break;
    }
    case "body": {
      const a = nextArticle();
      if (a) return { kind: "article", id: a.id };
      break;
    }
    case "sidebar": {
      const a = nextArticle();
      if (a) return { kind: "article", id: a.id };
      break;
    }
    case "image":
    case "gallery": {
      const img = nextImage();
      if (img) return { kind: "image", id: img.id };
      break;
    }
  }
  // Fallback to filler.
  if (fillerMode === "GENERATE") {
    // Deterministic placeholder caption — the AI filler endpoint will overwrite these
    // with on-brand copy when the user clicks Generate.
    return {
      kind: "placeholder",
      inline: {
        title: slot.type === "headline" ? "A note from the community" : undefined,
        body:
          slot.type === "body" || slot.type === "sidebar"
            ? `Filler block ${idx + 1} — awaiting generated copy.`
            : undefined,
        caption: slot.type === "image" || slot.type === "gallery" ? "Photo placeholder" : undefined,
      },
    };
  }
  return {
    kind: "placeholder",
    inline: { caption: `Placeholder — ${slot.type} (${seed.slice(0, 6)})` },
  };
}
