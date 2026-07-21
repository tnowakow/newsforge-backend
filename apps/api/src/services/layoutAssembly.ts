/**
 * Deterministic layout assembler / fitter.
 *
 * Inputs: a template (with gridSpec.slots), a list of articles, a list of images,
 * and the client's recurringSections.
 *
 * Output: an AssembledLayout — slots are filled greedily by matching slot.type to
 * content kind. Recurring sections claim their preferred slot type first.
 * Unfilled slots are marked needsFiller=true.
 */
import { createId } from "@paralleldrive/cuid2";
import type {
  AssembledLayout,
  Article,
  LayoutBlock,
  NewsImage,
  RecurringSection,
  GridSpec,
  TemplateSlot,
} from "@newsforge/shared/schemas";

interface AssembleInput {
  templateId: string;
  pageCount: number;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  /** Optional previous version (used to bump version). */
  previousVersion?: number;
}

function compareSlots(a: TemplateSlot, b: TemplateSlot): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function newBlockFor(slot: TemplateSlot): LayoutBlock {
  return {
    blockId: createId(),
    slotId: slot.id,
    page: slot.page,
    position: {
      col: slot.col,
      row: slot.row,
      colSpan: slot.colSpan,
      rowSpan: slot.rowSpan,
    },
    kind: "empty",
    needsFiller: false,
    styleTag: slot.styleTag,
  };
}

export function assembleLayout(input: AssembleInput): AssembledLayout {
  const slots = [...input.gridSpec.slots].sort(compareSlots);
  const blocks: LayoutBlock[] = slots.map(newBlockFor);

  // Working copies (we'll consume as we place)
  const articlePool = [...input.articles];
  const imagePool = [...input.images];
  const recurringPool = [...input.recurringSections];

  let placedArticles = 0;
  let placedImages = 0;
  let fillerBlocks = 0;

  // Pass 1 — place required recurring sections into matching slot types.
  for (const section of recurringPool) {
    const idx = blocks.findIndex((b, i) => {
      const s = slots[i];
      return b.kind === "empty" && s.type === section.slotHint;
    });
    if (idx === -1) continue;
    const slot = slots[idx];
    const matchingArticle =
      articlePool.find((a) => a.sectionId === section.id) ??
      articlePool.find((a) => !a.sectionId);
    if (matchingArticle) {
      const i = articlePool.indexOf(matchingArticle);
      articlePool.splice(i, 1);
      blocks[idx] = {
        ...blocks[idx],
        kind: "recurring",
        articleId: matchingArticle.id,
        sectionId: section.id,
      };
      placedArticles += 1;
    } else {
      // Reserve slot for later filler.
      blocks[idx] = {
        ...blocks[idx],
        kind: "recurring",
        sectionId: section.id,
        needsFiller: true,
      };
    }
  }

  // Pass 2 — fill remaining slots greedily by type.
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind !== "empty") continue;
    const slot = slots[i];

    if (slot.type === "image") {
      const img = imagePool.shift();
      if (img) {
        blocks[i] = { ...blocks[i], kind: "image", imageId: img.id };
        placedImages += 1;
      } else {
        blocks[i] = { ...blocks[i], needsFiller: true };
      }
      continue;
    }

    if (
      slot.type === "headline" ||
      slot.type === "body" ||
      slot.type === "sidebar" ||
      slot.type === "spotlight" ||
      slot.type === "calendar"
    ) {
      // Choose article best matching capacity.
      const max = slot.capacity.maxWords ?? Number.MAX_SAFE_INTEGER;
      const min = slot.capacity.minWords ?? 0;
      let pickIdx = articlePool.findIndex(
        (a) => a.wordCount >= min && a.wordCount <= max,
      );
      if (pickIdx === -1 && articlePool.length > 0) {
        const fallbackIdx = articlePool.findIndex(
          (a) => min === 0 || a.wordCount >= Math.floor(min * 0.6),
        );
        pickIdx = fallbackIdx;
      }
      if (pickIdx !== -1) {
        const article = articlePool.splice(pickIdx, 1)[0];
        blocks[i] = { ...blocks[i], kind: "article", articleId: article.id };
        placedArticles += 1;
      } else {
        blocks[i] = { ...blocks[i], needsFiller: true };
      }
      continue;
    }

    // Anything labeled "filler" is reserved for filler from the start.
    if (slot.type === "filler") {
      blocks[i] = { ...blocks[i], needsFiller: true };
    }
  }

  // Pass 3 — any block still empty becomes empty + needsFiller=true
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "empty") {
      blocks[i] = { ...blocks[i], needsFiller: true };
    }
    if (blocks[i].needsFiller) fillerBlocks += 1;
  }

  const unfilledSlotIds = blocks
    .filter((b) => b.needsFiller)
    .map((b) => b.slotId);

  const emptySlots = blocks.filter(
    (b) => b.kind === "empty" && b.needsFiller,
  ).length;

  return {
    templateId: input.templateId,
    pageCount: input.pageCount,
    blocks,
    unfilledSlotIds,
    stats: {
      placedArticles,
      placedImages,
      fillerBlocks,
      emptySlots,
    },
    version: (input.previousVersion ?? 0) + 1,
  };
}
