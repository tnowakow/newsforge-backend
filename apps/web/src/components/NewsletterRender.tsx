/**
 * v3 NewsletterRender — the shared page renderer for preview AND editing.
 *
 * Prop-compatible with v2 (Workspace/Preview compile untouched), but:
 *   - renders the v3 visual vocabulary: colored panels, script/section
 *     headings, birthday & schedule list blocks, photo captions
 *   - direct manipulation: pointer-drag to move, corner handle to resize
 *     (converted to grid steps via the existing onMoveBlock/onResizeBlock
 *     callbacks — no parent changes needed)
 *   - supports both 12-col legacy templates and 24-col v3 spreads
 *     (grid inferred from block extents; see lib/v3.ts)
 */
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import type {
  Article,
  AssembledLayout,
  ClientFull,
  LayoutBlock,
  NewsImage,
} from "@/lib/types";
import { DARK_TOKENS, inferColumns, inferRows, resolveToken } from "@/lib/v3";

interface NewsletterRenderProps {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  client: ClientFull;
  monthLabel?: string;
  /** Optional click handler for a block (used in Edit Mode). */
  onSelectBlock?: (blockId: string) => void;
  onMoveBlock?: (blockId: string, dCol: number, dRow: number) => void;
  onResizeBlock?: (blockId: string, dColSpan: number, dRowSpan: number) => void;
  onDuplicateBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onLayerBlock?: (blockId: string, direction: "forward" | "backward") => void;
  selectedBlockId?: string | null;
  editable?: boolean;
  /** Page filter — if set, only renders that page. */
  filterPage?: number;
  /** Scale (0..1) applied to page width via CSS transform. */
  scale?: number;
  /** Per-page ref callback to enable thumbnail jumping. */
  registerPage?: (page: number, el: HTMLDivElement | null) => void;
}

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
  onMoveBlock,
  onResizeBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onLayerBlock,
  selectedBlockId,
  editable,
  filterPage,
  scale = 1,
  registerPage,
}: NewsletterRenderProps) {
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const imageById = new Map(images.map((i) => [i.id, i]));
  const grouped = blocksByPage(layout);
  const cols = inferColumns(layout.blocks);
  const rows = inferRows(layout.blocks);
  const gridRefs = useRef(new Map<number, HTMLDivElement>());
  const pages = Array.from({ length: layout.pageCount }, (_, i) => i + 1).filter(
    (p) => (filterPage ? p === filterPage : true),
  );

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
            <Masthead client={client} page={page} monthLabel={monthLabel} />
            <div
              ref={(el) => {
                if (el) gridRefs.current.set(page, el);
                else gridRefs.current.delete(page);
              }}
              className="absolute left-10 right-10 top-[118px] bottom-[64px] grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                gap: 6,
              }}
            >
              {pageBlocks.map((b) => (
                <BlockView
                  key={b.blockId}
                  block={b}
                  client={client}
                  cols={cols}
                  rows={rows}
                  gridEl={() => gridRefs.current.get(page) ?? null}
                  article={b.articleId ? articleById.get(b.articleId) : undefined}
                  image={b.imageId ? imageById.get(b.imageId) : undefined}
                  selected={selectedBlockId === b.blockId}
                  editable={editable}
                  onSelect={onSelectBlock}
                  onMove={onMoveBlock}
                  onResize={onResizeBlock}
                  onDuplicate={onDuplicateBlock}
                  onDelete={onDeleteBlock}
                  onLayer={onLayerBlock}
                />
              ))}
            </div>
            <PageFooter client={client} page={page} monthLabel={monthLabel} />
          </div>
        );
      })}
    </div>
  );
}

function Masthead({
  client,
  page,
  monthLabel,
}: {
  client: ClientFull;
  page: number;
  monthLabel?: string;
}) {
  if (page > 1) {
    return (
      <header className="absolute left-10 right-10 top-8 flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-500">
        <span style={{ color: client.accentColor }}>{client.name}</span>
        <span>{monthLabel ?? "This Month"}</span>
      </header>
    );
  }
  return (
    <header
      className="absolute left-10 right-10 top-8"
      style={{ fontFamily: `${client.headingFont}, Georgia, serif` }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: client.accentColor }}
      >
        {monthLabel ?? "This Month"} · Community Newsletter
      </div>
      <h1
        className="mt-1 text-[34px] font-bold leading-[1.02]"
        style={{ color: client.primaryColor }}
      >
        {client.name}
      </h1>
    </header>
  );
}

function PageFooter({
  client,
  page,
  monthLabel,
}: {
  client: ClientFull;
  page: number;
  monthLabel?: string;
}) {
  return (
    <footer
      className="absolute bottom-6 left-10 right-10 flex justify-between border-t-2 pt-1.5 text-[9px] uppercase tracking-[0.12em] text-neutral-500"
      style={{ borderColor: client.accentColor }}
    >
      <span>{client.name}</span>
      <span>
        {monthLabel ?? ""} · Page {page}
      </span>
    </footer>
  );
}

// ---------------------------------------------------------------- BlockView

interface BlockViewProps {
  block: LayoutBlock;
  client: ClientFull;
  cols: number;
  rows: number;
  gridEl: () => HTMLDivElement | null;
  article?: Article;
  image?: NewsImage;
  selected: boolean;
  editable?: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, dCol: number, dRow: number) => void;
  onResize?: (id: string, dColSpan: number, dRowSpan: number) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLayer?: (id: string, direction: "forward" | "backward") => void;
}

function BlockView({
  block,
  client,
  cols,
  rows,
  gridEl,
  article,
  image,
  selected,
  editable,
  onSelect,
  onMove,
  onResize,
  onDuplicate,
  onDelete,
  onLayer,
}: BlockViewProps) {
  const drag = useRef<{ x: number; y: number; emittedC: number; emittedR: number } | null>(null);

  const bg = resolveToken(block.style?.bg, client);
  const invert =
    block.style?.invertText ||
    (block.style?.bg ? DARK_TOKENS.has(block.style.bg) : false);
  const headerColor =
    resolveToken(block.style?.headerColor, client) ?? client.primaryColor;
  const radius = block.style?.cornerRadius ?? (bg ? 10 : 0);

  const cellSize = () => {
    const el = gridEl();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width / cols, h: r.height / rows };
  };

  function beginGesture(
    e: PointerEvent<HTMLDivElement>,
    emit: (dc: number, dr: number) => void,
  ) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(block.blockId);
    const cell = cellSize();
    if (!cell) return;
    drag.current = { x: e.clientX, y: e.clientY, emittedC: 0, emittedR: 0 };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: globalThis.PointerEvent) => {
      if (!drag.current) return;
      const wantC = Math.round((ev.clientX - drag.current.x) / cell.w);
      const wantR = Math.round((ev.clientY - drag.current.y) / cell.h);
      const dc = wantC - drag.current.emittedC;
      const dr = wantR - drag.current.emittedR;
      if (dc !== 0 || dr !== 0) {
        emit(dc, dr);
        drag.current.emittedC = wantC;
        drag.current.emittedR = wantR;
      }
    };
    const up = () => {
      drag.current = null;
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const heading = block.heading ?? article?.title;
  const headingEl = heading ? (
    block.style?.scriptHeading ? (
      <h2
        className="mb-1 text-[15px] font-bold italic leading-tight"
        style={{
          color: invert ? "#F7F5EF" : headerColor,
          fontFamily: `${client.headingFont}, Georgia, serif`,
        }}
      >
        {heading}
      </h2>
    ) : (
      <h2
        className="mb-1 text-[13px] font-extrabold uppercase leading-tight tracking-wide"
        style={{
          color: invert ? "#F7F5EF" : headerColor,
          fontFamily: `${client.headingFont}, Georgia, serif`,
        }}
      >
        {heading}
      </h2>
    )
  ) : null;

  let content: React.ReactNode = null;
  if (block.kind === "image" && image) {
    content = (
      <figure className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg">
          <img
            src={image.url}
            alt={image.alt ?? ""}
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${image.focalX ?? 50}% ${image.focalY ?? 50}%`,
              transform: `scale(${image.zoom ?? 1})`,
              transformOrigin: `${image.focalX ?? 50}% ${image.focalY ?? 50}%`,
            }}
            draggable={false}
          />
        </div>
        {block.caption && (
          <figcaption className="pt-0.5 text-center text-[8.5px] italic text-neutral-500">
            {block.caption}
          </figcaption>
        )}
      </figure>
    );
  } else if (block.kind === "list") {
    content = (
      <div className="text-[9px] leading-[1.55]">
        {headingEl}
        {(block.listItems ?? []).map((item, i) =>
          item.isGroupHeader ? (
            <div
              key={i}
              className="mt-1 text-[8px] font-extrabold tracking-[0.12em] opacity-80"
            >
              {item.label}
            </div>
          ) : (
            <div
              key={i}
              className="flex justify-between gap-2 border-b border-dotted border-black/10 py-px"
              style={invert ? { borderColor: "rgba(255,255,255,0.25)" } : undefined}
            >
              <span className="font-semibold">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ),
        )}
      </div>
    );
  } else if (article || block.inlineText) {
    const body = article?.body ?? block.inlineText ?? "";
    content = (
      <div className={cn("min-h-0 flex-1 overflow-hidden", block.style?.centered && "text-center")}>
        {headingEl}
        {article?.byline && (
          <div className="mb-0.5 text-[8px] opacity-70">By {article.byline}</div>
        )}
        <div className="whitespace-pre-line text-[9px] leading-[1.4]">{body}</div>
      </div>
    );
  } else {
    content = editable ? (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 text-[9px] text-neutral-400">
        {block.needsFiller ? "needs filler" : "empty"}
      </div>
    ) : null;
  }

  return (
    <div
      data-block-id={block.blockId}
      className={cn(
        "relative flex min-h-0 min-w-0",
        editable && "cursor-grab active:cursor-grabbing",
        selected && "z-30",
      )}
      style={{
        gridColumn: `${block.position.col} / span ${block.position.colSpan}`,
        gridRow: `${block.position.row} / span ${block.position.rowSpan}`,
        zIndex: selected ? 30 : block.zIndex ?? 0,
      }}
      onPointerDown={(e) => {
        if (!editable || !onMove) return;
        beginGesture(e, (dc, dr) => onMove(block.blockId, dc, dr));
      }}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        onSelect?.(block.blockId);
      }}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          bg && "px-2.5 py-2",
          editable && "ring-1 ring-transparent hover:ring-sky-300",
          selected && "ring-2 !ring-sky-500",
        )}
        style={{
          background: bg ?? undefined,
          borderRadius: radius || undefined,
          color: invert ? "#F7F5EF" : undefined,
        }}
      >
        {content}
      </div>

      {editable && selected && (
        <>
          <div className="absolute -top-7 left-0 z-40 flex gap-1 rounded-md border border-neutral-200 bg-white/95 px-1.5 py-0.5 text-[10px] shadow">
            <button
              type="button"
              title="Duplicate"
              className="px-1 hover:text-sky-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate?.(block.blockId);
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              title="Bring forward"
              className="px-1 hover:text-sky-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayer?.(block.blockId, "forward");
              }}
            >
              ▲
            </button>
            <button
              type="button"
              title="Send backward"
              className="px-1 hover:text-sky-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayer?.(block.blockId, "backward");
              }}
            >
              ▼
            </button>
            <button
              type="button"
              title="Delete"
              className="px-1 text-red-500 hover:text-red-700"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(block.blockId);
              }}
            >
              ✕
            </button>
          </div>
          {onResize && (
            <div
              title="Drag to resize"
              className="absolute -bottom-1.5 -right-1.5 z-40 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500 shadow"
              onPointerDown={(e) =>
                beginGesture(e, (dc, dr) => onResize(block.blockId, dc, dr))
              }
            />
          )}
        </>
      )}
    </div>
  );
}
