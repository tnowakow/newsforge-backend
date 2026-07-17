import { forwardRef, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import type {
  Article,
  AssembledLayout,
  ClientFull,
  LayoutBlock,
  NewsImage,
} from "@/lib/types";

interface NewsletterRenderProps {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  client: ClientFull;
  monthLabel?: string;
  /** Optional click handler for a block (used in Edit Mode). */
  onSelectBlock?: (blockId: string) => void;
  selectedBlockId?: string | null;
  editable?: boolean;
  /** Page filter — if set, only renders that page. */
  filterPage?: number;
  /** Scale (0..1) applied to page width via CSS transform. */
  scale?: number;
  /** Per-page ref callback to enable thumbnail jumping. */
  registerPage?: (page: number, el: HTMLDivElement | null) => void;
}

/** Group blocks into a per-page bucket sorted by row then col. */
function blocksByPage(layout: AssembledLayout): Map<number, LayoutBlock[]> {
  const map = new Map<number, LayoutBlock[]>();
  for (const b of layout.blocks) {
    if (!map.has(b.page)) map.set(b.page, []);
    map.get(b.page)!.push(b);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) =>
      a.position.row !== b.position.row
        ? a.position.row - b.position.row
        : a.position.col - b.position.col,
    );
  }
  return map;
}

export function NewsletterRender({
  layout,
  articles,
  images,
  client,
  monthLabel,
  onSelectBlock,
  selectedBlockId,
  editable,
  filterPage,
  scale = 1,
  registerPage,
}: NewsletterRenderProps) {
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const imageById = new Map(images.map((i) => [i.id, i]));
  const grouped = blocksByPage(layout);
  const pages = Array.from({ length: layout.pageCount }, (_, i) => i + 1).filter(
    (p) => (filterPage ? p === filterPage : true),
  );

  // Brand-kit-driven CSS variables on each page surface.
  const brandStyle: CSSProperties = {
    // @ts-expect-error custom CSS vars
    "--brand-primary": client.primaryColor,
    "--brand-secondary": client.secondaryColor,
    "--brand-accent": client.accentColor,
    "--brand-heading-font": client.headingFont,
    "--brand-body-font": client.bodyFont,
    fontFamily: `${client.bodyFont}, Georgia, serif`,
  };

  return (
    <div className="flex flex-col items-center gap-8">
      {pages.map((page) => {
        const pageBlocks = grouped.get(page) ?? [];
        return (
          <div
            key={page}
            data-page={page}
            ref={(el) => registerPage?.(page, el)}
            className="page-surface relative"
            style={{
              ...brandStyle,
              transform: scale !== 1 ? `scale(${scale})` : undefined,
              transformOrigin: "top center",
              marginBottom: scale !== 1 ? -((1 - scale) * 1056) : undefined,
            }}
          >
            <PageMasthead
              client={client}
              page={page}
              total={layout.pageCount}
              monthLabel={monthLabel}
            />
            <div
              className="absolute left-12 right-12 top-[140px] bottom-[80px] grid gap-3"
              style={{
                gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                gridAutoRows: "minmax(28px, auto)",
              }}
            >
              {pageBlocks.map((b) => (
                <BlockView
                  key={b.blockId}
                  block={b}
                  article={
                    b.articleId ? articleById.get(b.articleId) : undefined
                  }
                  image={b.imageId ? imageById.get(b.imageId) : undefined}
                  selected={selectedBlockId === b.blockId}
                  editable={editable}
                  onSelect={onSelectBlock}
                />
              ))}
            </div>
            <PageFooter client={client} page={page} total={layout.pageCount} />
          </div>
        );
      })}
    </div>
  );
}

function PageMasthead({
  client,
  page,
  total,
  monthLabel,
}: {
  client: ClientFull;
  page: number;
  total: number;
  monthLabel?: string;
}) {
  if (page === 1) {
    return (
      <header
        className="absolute left-12 right-12 top-12"
        style={{ fontFamily: `${client.headingFont}, Georgia, serif` }}
      >
        <div
          className="text-2xs uppercase tracking-[0.18em]"
          style={{ color: client.accentColor }}
        >
          {monthLabel ?? "This Month"} · Newsletter
        </div>
        <h1
          className="font-bold text-[44px] leading-[1.05] mt-2"
          style={{ color: client.primaryColor }}
        >
          {client.name}
        </h1>
        {client.tagline && (
          <div className="text-sm mt-1.5" style={{ color: "#555" }}>
            {client.tagline}
          </div>
        )}
        <div
          className="h-px mt-6"
          style={{ background: client.secondaryColor }}
        />
      </header>
    );
  }
  return (
    <header
      className="absolute left-12 right-12 top-12 flex items-center justify-between text-2xs uppercase tracking-widest"
      style={{
        fontFamily: `${client.headingFont}, serif`,
        color: client.primaryColor,
      }}
    >
      <span>{client.name}</span>
      <span>
        {monthLabel ?? "Newsletter"} · {page} / {total}
      </span>
    </header>
  );
}

function PageFooter({
  client,
  page,
  total,
}: {
  client: ClientFull;
  page: number;
  total: number;
}) {
  return (
    <footer
      className="absolute left-12 right-12 bottom-8 flex items-center justify-between text-2xs"
      style={{ color: "#888" }}
    >
      <span style={{ fontFamily: `${client.headingFont}, serif` }}>
        {client.name}
      </span>
      <span>
        Page {page} of {total}
      </span>
    </footer>
  );
}

function BlockView({
  block,
  article,
  image,
  selected,
  editable,
  onSelect,
}: {
  block: LayoutBlock;
  article?: Article;
  image?: NewsImage;
  selected?: boolean;
  editable?: boolean;
  onSelect?: (id: string) => void;
}) {
  const { col, row, colSpan, rowSpan } = block.position;
  const style: CSSProperties = {
    gridColumn: `${Math.max(1, col)} / span ${Math.max(1, colSpan)}`,
    gridRow: `${Math.max(1, row)} / span ${Math.max(1, rowSpan)}`,
  };

  const tagClass = block.styleTag ? `tag-${block.styleTag}` : "";
  const interactiveClasses = editable
    ? cn(
        "cursor-pointer transition-shadow rounded",
        selected
          ? "outline outline-2 outline-[rgb(var(--accent))]"
          : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-[rgb(var(--accent))]",
      )
    : "";

  const handleClick = editable
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect?.(block.blockId);
      }
    : undefined;

  if (block.kind === "image") {
    return (
      <div
        style={style}
        className={cn("relative overflow-hidden rounded", tagClass, interactiveClasses)}
        onClick={handleClick}
      >
        {image?.url ? (
          <img
            src={image.url}
            alt={image.alt ?? ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full grid place-items-center text-white/85 text-xs"
            style={{ background: "var(--brand-secondary,#888)" }}
          >
            {image?.caption ?? "Image"}
          </div>
        )}
      </div>
    );
  }

  if (block.kind === "placeholder" || block.kind === "empty") {
    return (
      <div
        style={style}
        className={cn(
          "rounded border border-dashed text-2xs grid place-items-center text-center px-2 py-2",
          tagClass,
          interactiveClasses,
        )}
        onClick={handleClick}
      >
        <div style={{ color: "#aaa" }}>
          Placeholder — content TBD
          {block.styleTag && (
            <div className="opacity-60 mt-1">[{block.styleTag}]</div>
          )}
        </div>
      </div>
    );
  }

  if (block.kind === "filler" || block.kind === "recurring" || block.kind === "article") {
    const title = article?.title ?? block.sectionId ?? "Untitled";
    const body = article?.body ?? block.inlineText ?? "";
    return (
      <article
        style={style}
        className={cn("rounded overflow-hidden", tagClass, interactiveClasses)}
        onClick={handleClick}
      >
        <h3
          className="font-semibold text-base leading-snug"
          style={{
            fontFamily: "var(--brand-heading-font, serif)",
            color: "var(--brand-primary)",
          }}
        >
          {title}
        </h3>
        {article?.byline && (
          <div className="text-2xs uppercase tracking-widest mt-0.5" style={{ color: "#888" }}>
            By {article.byline}
          </div>
        )}
        <p
          className="text-[12.5px] leading-[1.45] mt-2 whitespace-pre-line"
          style={{ color: "#333" }}
        >
          {truncate(body, 600)}
        </p>
        {block.kind === "filler" && (
          <div className="mt-2 text-2xs italic" style={{ color: "#aaa" }}>
            AI-assisted filler
          </div>
        )}
      </article>
    );
  }

  return null;
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

/** Mini-thumbnail variant: zooms down + ignores clicks. */
export const NewsletterThumbnail = forwardRef<
  HTMLDivElement,
  Omit<NewsletterRenderProps, "scale" | "registerPage"> & { scale: number }
>(function Thumb(props, ref) {
  return (
    <div
      ref={ref}
      className="overflow-hidden bg-white border border-rule rounded"
      style={{
        width: 816 * props.scale,
        height: 1056 * props.scale,
      }}
    >
      <div
        style={{
          transform: `scale(${props.scale})`,
          transformOrigin: "top left",
          width: 816,
          height: 1056,
        }}
      >
        <NewsletterRender {...props} scale={1} />
      </div>
    </div>
  );
});
