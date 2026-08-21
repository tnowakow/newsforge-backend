import type { Article, AssembledLayout, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import type { CandidateMeasurement } from "./adaptiveLayoutPlanner.js";
import {
  buildPorterSourceUnits,
  porterBlocksAreAdjacent,
  porterImageMatchesRef,
  sourceUnitBlock,
} from "./porterSourceSemantics.js";

export interface PorterLayoutInvariantFailure {
  id: string;
  severity: "hard" | "warning";
  message: string;
}

export interface PorterLayoutInvariantReport {
  passed: boolean;
  hardFailures: string[];
  warnings: string[];
  failures: PorterLayoutInvariantFailure[];
}

interface EvaluateInput {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  measurement?: CandidateMeasurement;
  requireSource?: boolean;
}

function add(
  failures: PorterLayoutInvariantFailure[],
  severity: PorterLayoutInvariantFailure["severity"],
  id: string,
  message: string,
): void {
  failures.push({ severity, id, message });
}

function innerBlocks(layout: AssembledLayout): LayoutBlock[] {
  if (layout.pageCount < 4) return layout.blocks.filter((block) => block.kind !== "empty");
  return layout.blocks
    .filter((block) => block.page === 2 || block.page === 3)
    .map((block) => ({ ...block, page: block.page - 1 }))
    .filter((block) => block.kind !== "empty");
}

function listRowCount(block: LayoutBlock | undefined): number {
  return block?.listItems?.filter((item) => item.label || item.value).length ?? 0;
}

function hasMeaningfulText(block: LayoutBlock): boolean {
  return Boolean(block.articleId || block.kind === "list" || (block.inlineText && block.inlineText.trim().length >= 20));
}

export function evaluatePorterLayoutInvariants(input: EvaluateInput): PorterLayoutInvariantReport {
  const { layout, articles, images, measurement } = input;
  const failures: PorterLayoutInvariantFailure[] = [];
  const sourceArticles = articles.filter((article) => article.source === "UPLOAD");
  const requireSource = input.requireSource ?? sourceArticles.length > 0;
  const units = buildPorterSourceUnits(sourceArticles.length > 0 ? sourceArticles : articles, images);
  const blocks = innerBlocks(layout);

  if (requireSource && articles.length === 0) {
    add(failures, "hard", "source-parse-failed", "Source mode was requested but no parsed source articles/lists were available.");
  }

  for (const unit of units) {
    for (const articleId of unit.articleIds) {
      const block = sourceUnitBlock(blocks, articleId);
      if (!block) {
        add(failures, "hard", "source-unit-missing", `Required ${unit.role} source unit ${articleId} was not placed on the inner spread.`);
        continue;
      }
      const requiredRows = unit.rows?.length ?? 0;
      if (requiredRows > 0 && listRowCount(block) < requiredRows) {
        add(failures, "hard", "source-rows-dropped", `${unit.role} ${articleId} placed ${listRowCount(block)}/${requiredRows} source rows.`);
      }
    }
  }

  const pageCount = layout.pageCount >= 4 ? 2 : Math.max(layout.pageCount, 1);
  for (let page = 1; page <= pageCount; page++) {
    const pageBlocks = blocks.filter((block) => block.page === page);
    if (pageBlocks.some((block) => block.imageId) && !pageBlocks.some(hasMeaningfulText)) {
      add(failures, "hard", "photo-only-inner-page", `Inner page ${page} contains images but no meaningful article or list content.`);
    }
  }

  if ((measurement?.clippedBlocks ?? 0) > 0) {
    add(failures, "hard", "render-clipped-blocks", `${measurement?.clippedBlocks} clipped rendered block(s).`);
  }
  if ((measurement?.overflowBlocks ?? 0) > 0) {
    add(failures, "hard", "render-overflow-blocks", `${measurement?.overflowBlocks} overflowing rendered block(s).`);
  }
  if ((measurement?.missingImages ?? 0) > 0) {
    add(failures, "hard", "render-missing-images", `${measurement?.missingImages} missing rendered image(s).`);
  }
  if ((measurement?.placeholderImages ?? 0) > 0) {
    add(failures, "hard", "render-placeholder-images", `${measurement?.placeholderImages} placeholder/test rendered image(s).`);
  }

  const imageBlocks = blocks.filter((block) => block.imageId);
  for (const article of articles) {
    const refs = article.imageRefs ?? [];
    if (refs.length === 0) continue;
    const textBlock = sourceUnitBlock(blocks, article.id);
    if (!textBlock) continue;
    const matchedImageIds = images
      .filter((image) => refs.some((ref) => porterImageMatchesRef(image, ref)))
      .map((image) => image.id);
    if (matchedImageIds.length === 0) {
      add(failures, "warning", "source-photo-unresolved", `${article.title} references ${refs.join(", ")} but no uploaded filename/caption matched exactly.`);
      continue;
    }
    const adjacent = imageBlocks.some((block) =>
      block.imageId &&
      matchedImageIds.includes(block.imageId) &&
      porterBlocksAreAdjacent(textBlock, block),
    );
    if (!adjacent) {
      add(failures, "hard", "source-photo-not-adjacent", `${article.title} has an explicit associated photo that is not adjacent to its story block.`);
    }
  }

  const hardFailures = failures
    .filter((failure) => failure.severity === "hard")
    .map((failure) => `${failure.id}: ${failure.message}`);
  const warnings = failures
    .filter((failure) => failure.severity === "warning")
    .map((failure) => `${failure.id}: ${failure.message}`);

  return {
    passed: hardFailures.length === 0,
    hardFailures,
    warnings,
    failures,
  };
}

