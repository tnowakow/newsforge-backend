import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";

export type PorterSourceRole =
  | "director-note"
  | "birthday-roster"
  | "dated-list"
  | "profile-story"
  | "narrative-story"
  | "brief";

export interface PorterSourceRow {
  label: string;
  value?: string;
  isGroupHeader?: boolean;
}

export interface PorterSourceUnit {
  role: PorterSourceRole;
  articleIds: string[];
  rows?: PorterSourceRow[];
  imageRefs: string[];
  associationConfidence: "explicit" | "ordered" | "unresolved";
  sourceOrder: number;
}

export function normalizePorterText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/^.*[\\/]/, "")
    .replace(/\.(jpe?g|png|gif|webp|heic|heif|tiff?)$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function porterImageMatchesRef(image: NewsImage, ref: string): boolean {
  const needle = normalizePorterText(ref);
  if (!needle) return false;
  return [image.caption, image.alt, image.description, image.url].some((value) => {
    const candidate = normalizePorterText(value);
    return Boolean(candidate && (candidate.includes(needle) || needle.includes(candidate)));
  });
}

export function porterDatedRowsFromText(text: string): PorterSourceRow[] {
  return text
    .split(/\n+|;\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
      return match ? [{ value: match[1], label: match[2].trim() }] : [];
    });
}

export function porterBirthdayRowsFromText(text: string): PorterSourceRow[] {
  return text
    .split(/\n+|;\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (/^(residents?|staff|team members?)$/i.test(line)) {
        return [{ label: line.toUpperCase(), value: "", isGroupHeader: true }];
      }
      const match = line.match(/^(.+?)\s+(\d{1,2}\/\d{1,2})$/);
      return match ? [{ label: match[1].trim(), value: match[2] }] : [];
    });
}

export function porterDatedRowCount(article: Article): number {
  return porterDatedRowsFromText(article.body).length;
}

export function isPorterBirthdayArticle(article: Article): boolean {
  return article.sourceRole === "birthday-roster" || article.articleType === "birthday" || /\bbirthdays?\b|\bhappy birthday\b/i.test(article.title);
}

export function isPorterDirectorArticle(article: Article): boolean {
  return article.sourceRole === "director-note" || article.articleType === "executive-note" || /executive director|director corner|from the director/i.test(article.title);
}

export function isPorterNarrativeOutingArticle(article: Article): boolean {
  if (article.sourceRole === "narrative-story") return /outing|out\s*(?:&|and)\s*about/i.test(article.title);
  return /outings?|out\s*(?:&|and)\s*about/i.test(article.title) &&
    (article.imageRefs?.length ?? 0) > 0 &&
    porterDatedRowCount(article) < 2;
}

export function isPorterScheduleArticle(article: Article): boolean {
  if (article.sourceRole === "dated-list") return true;
  if (article.sourceRole === "birthday-roster" || article.sourceRole === "narrative-story") return false;
  if (isPorterBirthdayArticle(article)) return false;
  if (isPorterNarrativeOutingArticle(article)) return false;
  return (
    /happy hours?|socials?|brunch|events?|calendar|schedule/i.test(article.title) ||
    porterDatedRowCount(article) >= 2
  );
}

export function classifyPorterSourceRole(article: Article): PorterSourceRole {
  if (article.sourceRole) return article.sourceRole;
  if (isPorterDirectorArticle(article)) return "director-note";
  if (isPorterBirthdayArticle(article)) return "birthday-roster";
  if (isPorterScheduleArticle(article)) return "dated-list";
  if (article.articleType === "resident-story" || /legacy|spotlight|profile|resident/i.test(article.title)) {
    return "profile-story";
  }
  if ((article.imageRefs?.length ?? 0) > 0 || /outing|breakfast|tea|project|joy|celebrat/i.test(`${article.title} ${article.body}`)) {
    return "narrative-story";
  }
  return "brief";
}

export function buildPorterSourceUnits(articles: Article[], images: NewsImage[] = []): PorterSourceUnit[] {
  return articles.map((article, index) => {
    const role = classifyPorterSourceRole(article);
    const imageRefs = article.imageRefs ?? [];
    const explicit = imageRefs.some((ref) => images.some((image) => porterImageMatchesRef(image, ref)));
    const rows = role === "birthday-roster"
      ? porterBirthdayRowsFromText(article.body)
      : role === "dated-list"
        ? porterDatedRowsFromText(article.body)
        : undefined;
    return {
      role,
      articleIds: [article.id],
      rows,
      imageRefs,
      associationConfidence: imageRefs.length === 0 ? "unresolved" : explicit ? "explicit" : "unresolved",
      sourceOrder: index,
    };
  });
}

export function blockArea(block: LayoutBlock): number {
  return block.position.colSpan * block.position.rowSpan;
}

export function porterBlocksAreAdjacent(a: LayoutBlock, b: LayoutBlock): boolean {
  if (a.page !== b.page) return false;
  const aRight = a.position.col + a.position.colSpan - 1;
  const bRight = b.position.col + b.position.colSpan - 1;
  const aBottom = a.position.row + a.position.rowSpan - 1;
  const bBottom = b.position.row + b.position.rowSpan - 1;
  const horizontalGap = Math.max(0, Math.max(a.position.col, b.position.col) - Math.min(aRight, bRight) - 1);
  const verticalGap = Math.max(0, Math.max(a.position.row, b.position.row) - Math.min(aBottom, bBottom) - 1);
  const horizontalOverlap = Math.min(aRight, bRight) - Math.max(a.position.col, b.position.col) + 1;
  const verticalOverlap = Math.min(aBottom, bBottom) - Math.max(a.position.row, b.position.row) + 1;
  return (
    horizontalGap <= 1 && verticalOverlap >= 1 && verticalGap === 0
  ) || (
    verticalGap <= 1 && horizontalOverlap >= 1 && horizontalGap === 0
  );
}

export function sourceUnitBlock(layoutBlocks: LayoutBlock[], articleId: string): LayoutBlock | undefined {
  return layoutBlocks.find((block) => block.articleId === articleId || block.slotId === `source-${articleId}`);
}
