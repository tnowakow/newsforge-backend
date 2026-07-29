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

function slotArea(slot: TemplateSlot): number {
  return slot.colSpan * slot.rowSpan;
}

function slotMatchesSection(slot: TemplateSlot, section: RecurringSection): boolean {
  if (slot.type === section.slotHint) return true;
  const tag = slot.styleTag ?? "";
  if (slot.type === "list" && /birthday|anniversar|milestone/i.test(section.title)) {
    return /birthday/i.test(tag);
  }
  if (slot.type === "calendar" && /calendar|activit|event/i.test(section.title)) {
    return true;
  }
  return false;
}

function isArticleLikeSlot(slot: TemplateSlot): boolean {
  return (
    slot.type === "headline" ||
    slot.type === "body" ||
    slot.type === "sidebar" ||
    slot.type === "spotlight"
  );
}

function isArticleLikeSection(section: RecurringSection): boolean {
  return (
    section.slotHint === "headline" ||
    section.slotHint === "body" ||
    section.slotHint === "sidebar" ||
    section.slotHint === "spotlight"
  );
}

function articleMatchesSlot(article: Article, slot: TemplateSlot): boolean {
  const tag = slot.styleTag ?? "";
  const title = article.title;
  if (/birthday/i.test(tag)) {
    return article.articleType === "birthday" || /birthday|anniversar/i.test(title);
  }
  if (/exec-corner|director/i.test(tag)) {
    return /executive director|director corner|from the director/i.test(title);
  }
  if (/happy-hour|schedule/i.test(tag)) return /happy hour/i.test(title);
  if (/upcoming-events/i.test(tag)) return /upcoming events|calendar|activities/i.test(title);
  if (/out-and-about|outing/i.test(tag)) return /out and about|outing|trip/i.test(title);
  if (/smile-of-the-month|spotlight/i.test(tag)) return /smile of the month|spotlight|meet/i.test(title);
  if (/feature-band|scrubbly|car-wash/i.test(tag)) return /scrubbly|car wash|feature/i.test(title);
  if (/make-the-difference|volunteer/i.test(tag)) return /make the difference|volunteer/i.test(title);
  if (/trust-funds|info-footer/i.test(tag)) return /trust funds|business office|compliance/i.test(title);
  return false;
}

function requiresSemanticArticle(slot: TemplateSlot): boolean {
  return /birthday|exec-corner|director|happy-hour|schedule|upcoming-events|out-and-about|outing|smile-of-the-month|spotlight|feature-band|scrubbly|car-wash|make-the-difference|volunteer|trust-funds|info-footer/i.test(
    slot.styleTag ?? "",
  );
}

function matchesAnySemanticSlot(article: Article, slots: TemplateSlot[]): boolean {
  return slots.some(
    (slot) => requiresSemanticArticle(slot) && articleMatchesSlot(article, slot),
  );
}

function fitsSlotMaximum(article: Article, slot: TemplateSlot): boolean {
  const max = slot.capacity.maxWords ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(max)) return true;
  return article.wordCount <= Math.ceil(max * 1.15);
}

function sectionSlotScore(
  slot: TemplateSlot,
  section: RecurringSection,
  article: Article | undefined,
): number {
  const directMatch = slotMatchesSection(slot, section);
  const compatibleArticleSlot =
    article &&
    isArticleLikeSection(section) &&
    isArticleLikeSlot(slot) &&
    !requiresSemanticArticle(slot);
  if (!directMatch && !compatibleArticleSlot) return Number.NEGATIVE_INFINITY;
  if (article && requiresSemanticArticle(slot) && !articleMatchesSlot(article, slot)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = directMatch ? 60 : 35;
  if (article) {
    score += fitsSlotMaximum(article, slot) ? 40 : -35;
    const min = slot.capacity.minWords ?? 0;
    const max = slot.capacity.maxWords ?? Number.MAX_SAFE_INTEGER;
    if (article.wordCount >= min && article.wordCount <= max) score += 15;
    score += Math.min(slotArea(slot), 96) / 8;
  }
  if (articleMatchesSlot(article ?? ({ title: section.title, body: "", wordCount: 0 } as Article), slot)) {
    score += 25;
  }
  return score;
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
    const sectionArticle = articlePool.find((a) => a.sectionId === section.id);
    const idx = blocks
      .map((block, i) => ({
        i,
        score:
          block.kind === "empty"
            ? sectionSlotScore(slots[i], section, sectionArticle)
            : Number.NEGATIVE_INFINITY,
      }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score || compareSlots(slots[a.i], slots[b.i]))[0]?.i ?? -1;
    if (idx === -1) continue;
    const slot = slots[idx];
    const matchingArticle =
      articlePool.find((a) => a.sectionId === section.id) ??
      articlePool.find((a) => articleMatchesSlot(a, slot)) ??
      (requiresSemanticArticle(slot)
        ? undefined
        : articlePool.find((a) => !a.sectionId));
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
      slot.type === "calendar" ||
      slot.type === "list"
    ) {
      // Choose article best matching capacity.
      const max = slot.capacity.maxWords ?? Number.MAX_SAFE_INTEGER;
      const min = slot.capacity.minWords ?? 0;
      const remainingSlots = slots.slice(i + 1);
      let pickIdx = articlePool.findIndex((a) => articleMatchesSlot(a, slot));
      if (!requiresSemanticArticle(slot)) {
        if (pickIdx === -1) pickIdx = articlePool.findIndex(
          (a) =>
            a.wordCount >= min &&
            a.wordCount <= max &&
            !matchesAnySemanticSlot(a, remainingSlots),
        );
        if (pickIdx === -1 && articlePool.length > 0) {
          const fallbackIdx = articlePool.findIndex(
            (a) =>
              (min === 0 || a.wordCount >= Math.floor(min * 0.6)) &&
              fitsSlotMaximum(a, slot) &&
              !matchesAnySemanticSlot(a, remainingSlots),
          );
          pickIdx = fallbackIdx;
        }
        if (pickIdx === -1 && articlePool.length > 0) {
          pickIdx = articlePool.findIndex(
            (a) =>
              fitsSlotMaximum(a, slot) &&
              !matchesAnySemanticSlot(a, remainingSlots),
          );
        }
        if (pickIdx === -1 && articlePool.length > 0) {
          pickIdx = articlePool.findIndex(
            (a) =>
              fitsSlotMaximum(a, slot) &&
              (min === 0 || a.wordCount >= Math.floor(min * 0.6)),
          );
        }
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
