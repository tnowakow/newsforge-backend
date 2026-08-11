/**
 * layoutFitService — deterministic template scoring + fit strategy.
 * Pure functions; no I/O; unit-testable in isolation. Vitaly §6 + §7.
 *
 * Pipeline:
 *   pickBestTemplate(articles, images, candidates)
 *     -> chosen templateId + per-candidate score breakdown
 *   fitContent(articles, images, template)
 *     -> trimmed articles, dropped-image list, per-slot article fit,
 *        under-supply warnings, empty slot ids
 *   buildLayoutFitReport(...) glues the two together and returns the
 *   full LayoutFitReport ready to persist onto NewsletterRun.
 */
import {
  GridSpecSchema,
  type Article,
  type ArticleType,
  type LayoutFitReport,
  type LayoutFitCandidate,
  type LayoutFitArticleFit,
  type LayoutFitPhotoFit,
  type FitReport,
  type NewsImage,
  type TemplateSlot,
} from "@newsforge/shared/schemas";
import type { FullOutputScore } from "./porterOneReferenceScorer.js";

// A template shape we can score. Matches the Prisma Template row we pass in.
export interface ScoreableTemplate {
  id: string;
  pageCount: number;
  gridSpec: unknown; // JSONB from prisma; we validate inside.
}

function safeGridSlots(gridSpec: unknown): TemplateSlot[] {
  const parsed = GridSpecSchema.safeParse(gridSpec);
  return parsed.success ? parsed.data.slots : [];
}

function isArticleSlot(t: TemplateSlot["type"]): boolean {
  return (
    t === "headline" ||
    t === "body" ||
    t === "spotlight" ||
    t === "sidebar" ||
    t === "calendar" ||
    t === "list"
  );
}

const HERO_STYLE_TAGS = new Set([
  "hero",
  "hero-portrait",
  "cover",
  "kicker",
]);

function slotStats(slots: TemplateSlot[]) {
  const articleSlots = slots.filter((s) => isArticleSlot(s.type));
  const imageSlots = slots.filter((s) => s.type === "image");
  const heroSlots = slots.filter((s) =>
    HERO_STYLE_TAGS.has(s.styleTag ?? ""),
  );
  const wordCapacities = slots
    .map((s) => s.capacity?.maxWords)
    .filter((n): n is number => typeof n === "number");
  const avgSlotWords = wordCapacities.length
    ? wordCapacities.reduce((a, b) => a + b, 0) / wordCapacities.length
    : 200;
  return {
    articleSlots: articleSlots.length,
    imageSlots: imageSlots.length,
    heroSlots: heroSlots.length,
    avgSlotWords,
  };
}

export interface PickBestTemplateResult {
  chosenTemplateId: string;
  chosenScore: number;
  candidates: LayoutFitCandidate[];
}

/**
 * Score every candidate template deterministically and return the winner.
 * Never throws. If `candidates` is empty, returns a synthetic empty result
 * caller should never hit (routes/runs.ts filters candidates first).
 */
export function pickBestTemplate(
  articles: Article[],
  images: NewsImage[],
  candidates: ScoreableTemplate[],
): PickBestTemplateResult {
  const A = articles.length;
  const I = images.length;
  const Aavg =
    A === 0 ? 0 : articles.reduce((s, a) => s + a.wordCount, 0) / A;
  const hasResidentStory = articles.some(
    (a) => a.articleType === "resident-story",
  );

  const scored: Array<LayoutFitCandidate & { pageCount: number }> =
    candidates.map((t) => {
      const slots = safeGridSlots(t.gridSpec);
      const { articleSlots, imageSlots, heroSlots, avgSlotWords } =
        slotStats(slots);

      const articleCount =
        1 - Math.abs(A - articleSlots) / Math.max(A, articleSlots, 1);
      const photoCount =
        1 - Math.abs(I - imageSlots) / Math.max(I, imageSlots, 1);
      const articleTypeMatch =
        hasResidentStory && heroSlots > 0
          ? 1.0
          : !hasResidentStory && heroSlots === 0
          ? 0.7
          : 0.4;
      const avgWordDelta =
        1 - Math.min(Math.abs(Aavg - avgSlotWords) / 300, 1);

      const score =
        0.35 * articleCount +
        0.25 * photoCount +
        0.30 * articleTypeMatch +
        0.10 * avgWordDelta;

      return {
        templateId: t.id,
        score,
        subscores: {
          articleCount,
          photoCount,
          articleTypeMatch,
          avgWordDelta,
        },
        pageCount: t.pageCount,
      };
    });

  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.02) return b.score - a.score;
    if (a.subscores.avgWordDelta !== b.subscores.avgWordDelta) {
      return b.subscores.avgWordDelta - a.subscores.avgWordDelta;
    }
    if (a.pageCount !== b.pageCount) return a.pageCount - b.pageCount;
    return a.templateId.localeCompare(b.templateId);
  });

  const winner = scored[0];
  if (!winner) {
    return {
      chosenTemplateId: "",
      chosenScore: 0,
      candidates: [],
    };
  }
  const candidatesReport: LayoutFitCandidate[] = scored.map((s) => ({
    templateId: s.templateId,
    score: s.score,
    subscores: s.subscores,
  }));
  return {
    chosenTemplateId: winner.templateId,
    chosenScore: winner.score,
    candidates: candidatesReport,
  };
}

// ---- Fit strategy (§7) ----

function splitSentences(body: string): string[] {
  // Split preserving delimiter. Deterministic and never mid-sentence.
  const parts = body.split(/([.!?]+\s+)/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i] ?? "";
    const delim = parts[i + 1] ?? "";
    const combined = (chunk + delim).trim();
    if (combined.length > 0) out.push(combined);
  }
  return out;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(s: string, maxWords: number): string {
  return s.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

function finishTruncatedText(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return clean;
  if (/[.!?]$/.test(clean)) return clean;
  return `${clean.replace(/[,:;—-]\s*$/, "")}.`;
}

function truncateToSentenceCap(body: string, cap: number): { body: string; words: number } {
  const sentences = splitSentences(body);
  let acc = "";
  let words = 0;
  let took = 0;
  for (const s of sentences) {
    const sw = countWords(s);
    if (words + sw > cap && took > 0) break;
    acc = acc.length === 0 ? s : `${acc} ${s}`;
    words += sw;
    took += 1;
    if (words >= cap) break;
  }
  if (words > cap) {
    acc = finishTruncatedText(truncateWords(acc, cap));
    words = countWords(acc);
  }
  if (acc.length === 0) {
    acc = finishTruncatedText(truncateWords(body, cap));
    words = countWords(acc);
  }
  return { body: finishTruncatedText(acc), words };
}

function articleMatchesSemanticSlot(article: Article, slot: TemplateSlot): boolean {
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

function semanticSlotCap(article: Article, slots: TemplateSlot[]): number | undefined {
  const caps = slots
    .filter((slot) => isArticleSlot(slot.type) && articleMatchesSemanticSlot(article, slot))
    .map((slot) => slot.capacity?.maxWords)
    .filter((cap): cap is number => typeof cap === "number" && Number.isFinite(cap));
  return caps.length > 0 ? Math.min(...caps) : undefined;
}

function readableTrimFloor(article: Article, slot?: TemplateSlot): number {
  // Headline slots are intentionally allowed to become short decks. Body and
  // list modules must remain readable; a 69-word story becoming 13 words is
  // a layout failure, not a successful fit.
  if (slot?.type === "headline") return Math.min(article.wordCount, 18);
  return Math.min(article.wordCount, Math.max(18, Math.ceil(article.wordCount * 0.6)));
}

function safeTrimCap(article: Article, requestedCap: number, slot?: TemplateSlot): number {
  return Math.min(article.wordCount, Math.max(requestedCap, readableTrimFloor(article, slot)));
}

export interface FitContentResult {
  articles: Article[]; // possibly trimmed
  articleFit: LayoutFitArticleFit[];
  photoFit: LayoutFitPhotoFit[];
  droppedImageIds: string[]; // image ids removed
  keptImages: NewsImage[]; // images that made it (order preserved)
  emptySlots: string[];
  warnings: string[];
}

/**
 * Apply overflow/underflow trimming to fit articles + images into the chosen
 * template's slots. Deterministic and idempotent.
 */
export function fitContent(
  articles: Article[],
  images: NewsImage[],
  template: ScoreableTemplate,
): FitContentResult {
  const slots = safeGridSlots(template.gridSpec);
  const articleSlots = slots.filter((s) => isArticleSlot(s.type));
  const imageSlots = slots.filter((s) => s.type === "image");

  const warnings: string[] = [];
  const articleFit: LayoutFitArticleFit[] = [];
  const trimmedArticles: Article[] = [];

  // Pair articles to article-slots in the order slots appear (page/row/col
  // ordering matches layoutAssembly's own sort). Extra articles have no
  // slot — we still keep them but do not trim.
  const sortedSlots = [...articleSlots].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const slot = sortedSlots[i];
    const semanticCap = semanticSlotCap(article, sortedSlots);
    if (!slot) {
      // No positional slot, but semantic sections may still claim a later
      // targeted region during assembly. Keep those articles within that cap.
      if (semanticCap && article.wordCount > semanticCap) {
        const cap = safeTrimCap(article, semanticCap);
        const { body, words } = truncateToSentenceCap(article.body, cap);
        trimmedArticles.push({ ...article, body, wordCount: words });
        warnings.push(
          `content-trimmed: ${article.id} (${article.wordCount}→${words} words)`,
        );
      } else {
        trimmedArticles.push(article);
      }
      continue;
    }
    const requestedCap = semanticCap ?? slot.capacity?.maxWords;
    const cap = requestedCap ? safeTrimCap(article, requestedCap, slot) : undefined;
    if (!cap || article.wordCount <= cap) {
      trimmedArticles.push(article);
      articleFit.push({
        articleId: article.id,
        slotId: slot.id,
        wordsIn: article.wordCount,
        wordsOut: article.wordCount,
        trimmed: false,
      });
      continue;
    }
    const { body, words } = truncateToSentenceCap(article.body, cap);
    const newArticle: Article = {
      ...article,
      body,
      wordCount: words,
    };
    trimmedArticles.push(newArticle);
    articleFit.push({
      articleId: article.id,
      slotId: slot.id,
      wordsIn: article.wordCount,
      wordsOut: words,
      trimmed: true,
    });
    warnings.push(
      `content-trimmed: ${article.id} (${article.wordCount}→${words} words)`,
    );
  }

  // Photo fit — drop last-uploaded first if over-supplied.
  const photoFit: LayoutFitPhotoFit[] = [];
  const droppedImageIds: string[] = [];
  let keptImages: NewsImage[] = images;
  if (images.length > imageSlots.length) {
    // Order by array position; newest = highest index. Drop from tail.
    const wrapperPhotoReserve = template.id.startsWith("v3-") ? 2 : 0;
    const toKeep = imageSlots.length + wrapperPhotoReserve;
    keptImages = images.slice(0, toKeep);
    const dropped = images.slice(toKeep);
    for (const img of dropped) {
      droppedImageIds.push(img.id);
      photoFit.push({
        imageId: img.id,
        dropped: true,
        reason: "photo-unused",
      });
      warnings.push(
        `photo-unused: ${img.caption ?? img.id}`,
      );
    }
    // Map kept images to slots.
    for (let i = 0; i < keptImages.length; i++) {
      const slot = imageSlots[i];
      const img = keptImages[i];
      photoFit.push({
        imageId: img.id,
        slotId: slot?.id,
        dropped: false,
        reason: "fit",
      });
    }
  } else {
    for (let i = 0; i < images.length; i++) {
      const slot = imageSlots[i];
      photoFit.push({
        imageId: images[i].id,
        slotId: slot?.id,
        dropped: false,
        reason: "fit",
      });
    }
    if (images.length < imageSlots.length) {
      const empty = imageSlots.length - images.length;
      warnings.push(`photos-under-supplied: ${empty} slots empty`);
    }
  }

  // Empty article slots (under-supplied text) — for the report.
  const emptySlots: string[] = [];
  if (articles.length < articleSlots.length) {
    for (let i = articles.length; i < articleSlots.length; i++) {
      emptySlots.push(articleSlots[i].id);
    }
  }
  if (images.length < imageSlots.length) {
    for (let i = images.length; i < imageSlots.length; i++) {
      emptySlots.push(imageSlots[i].id);
    }
  }

  return {
    articles: trimmedArticles,
    articleFit,
    photoFit,
    droppedImageIds,
    keptImages,
    emptySlots,
    warnings,
  };
}

/**
 * Build a full LayoutFitReport from picking + fitting. Used by routes/runs.ts.
 */
export function buildLayoutFitReport(input: {
  articles: Article[];
  images: NewsImage[];
  candidates: ScoreableTemplate[];
  chosen: ScoreableTemplate;
  pickResult?: PickBestTemplateResult;
  fitResult: FitContentResult;
  design?: {
    mode: "ai" | "deterministic";
    designNotes?: string;
    fallbackReason?: string;
    editorialPlan?: LayoutFitReport["editorialPlan"];
    adaptiveCandidates?: LayoutFitReport["adaptiveCandidates"];
  };
  fullOutput?: FullOutputScore;
  fitReport?: FitReport;
}): LayoutFitReport {
  const pick =
    input.pickResult ??
    pickBestTemplate(input.articles, input.images, input.candidates);
  const selectedAdaptive = input.design?.adaptiveCandidates?.find((candidate) => candidate.selected);
  const selectedMeasurement = selectedAdaptive?.measurement;
  const selectedSubscores = selectedAdaptive?.subscores;

  return {
    chosenTemplateId: input.chosen.id,
    score: input.fullOutput?.fullOutputScore ??
      pick.candidates.find((c) => c.templateId === input.chosen.id)?.score ??
      pick.chosenScore,
    designMode: input.design?.mode,
    designNotes: input.design?.designNotes,
    fallbackReason: input.design?.fallbackReason,
    renderFit: selectedSubscores?.renderFit,
    usefulOccupancy: selectedSubscores?.usefulOccupancy ?? selectedMeasurement?.usefulOccupancy,
    geometricCoverage: selectedSubscores?.geometricCoverage ?? selectedMeasurement?.geometricCoverage,
    minPageUtility: selectedMeasurement?.minPageUtility,
    largestEmptyBandRatio: selectedMeasurement?.largestEmptyBandRatio,
    clippedBlocks: selectedMeasurement?.clippedBlocks,
    overflowBlocks: selectedMeasurement?.overflowBlocks,
    missingImages: selectedMeasurement?.missingImages,
    renderedImages: selectedMeasurement?.renderedImages,
    porterReferenceAffinity: selectedSubscores?.porterReferenceAffinity,
    porterReferenceId: selectedSubscores?.porterReferenceId,
    innerSpreadAffinity: input.fullOutput?.innerSpreadAffinity ?? selectedSubscores?.porterReferenceAffinity,
    fullOutputScore: input.fullOutput?.fullOutputScore,
    coverScore: input.fullOutput?.coverScore,
    coverRenderFit: input.fullOutput?.coverRenderFit,
    coverClippedBlocks: input.fullOutput?.coverClippedBlocks,
    coverOverflowBlocks: input.fullOutput?.coverOverflowBlocks,
    coverMissingImages: input.fullOutput?.coverMissingImages,
    coverContentBlocks: input.fullOutput?.coverContentBlocks,
    coverImageBlocks: input.fullOutput?.coverImageBlocks,
    coverDuplicateBirthdayBlocks: input.fullOutput?.coverDuplicateBirthdayBlocks,
    fitReport: input.fitReport,
    editorialPlan: input.design?.editorialPlan,
    adaptiveCandidates: input.design?.adaptiveCandidates,
    candidates: pick.candidates,
    articleFit: input.fitResult.articleFit,
    photoFit: input.fitResult.photoFit,
    emptySlots: input.fitResult.emptySlots,
    warnings: input.fitResult.warnings,
  };
}

// Re-export for callers that want ArticleType convenience.
export type { ArticleType };
