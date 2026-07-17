import { useRef } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import type {
  AssembledLayout,
  ClientFull,
  Article,
  NewsImage,
  LayoutBlock,
} from "@/lib/types";
import { NewsletterRender } from "./NewsletterRender";

interface EditableCanvasProps {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  client: ClientFull;
  monthLabel?: string;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onLayoutChange: (next: AssembledLayout) => void;
  registerPage: (page: number, el: HTMLDivElement | null) => void;
}

const COL_COUNT = 12;
const ROW_PX = 32; // approx row height for grid math (matches gridAutoRows minmax)

/**
 * Wraps NewsletterRender with drag-and-drop:
 * - Each block is a draggable.
 * - Each page surface is a droppable; on drop we recompute col/row from delta.
 *
 * NOTE: We render NewsletterRender as-is and overlay a transparent draggable
 * layer per block using absolute positioning matched to grid cells. This keeps
 * the renderer simple and lets us iterate later.
 */
export function EditableCanvas(props: EditableCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const blockId = String(e.active.id);
    const block = props.layout.blocks.find((b) => b.blockId === blockId);
    if (!block) return;
    const dx = e.delta.x;
    const dy = e.delta.y;

    // Approximate column width: 816px page minus 96px gutters = 720, / 12 = 60.
    const colWidth = 60;
    const dCol = Math.round(dx / colWidth);
    const dRow = Math.round(dy / ROW_PX);
    if (dCol === 0 && dRow === 0) return;

    const newCol = clamp(
      block.position.col + dCol,
      1,
      COL_COUNT - block.position.colSpan + 1,
    );
    const newRow = Math.max(1, block.position.row + dRow);
    const next: AssembledLayout = {
      ...props.layout,
      blocks: props.layout.blocks.map((b) =>
        b.blockId === blockId
          ? { ...b, position: { ...b.position, col: newCol, row: newRow } }
          : b,
      ),
    };
    props.onLayoutChange(next);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <NewsletterRender
        layout={props.layout}
        articles={props.articles}
        images={props.images}
        client={props.client}
        monthLabel={props.monthLabel}
        editable
        selectedBlockId={props.selectedBlockId}
        onSelectBlock={props.onSelectBlock}
        registerPage={props.registerPage}
      />
      <PerBlockDraggables
        layout={props.layout}
        onSelect={props.onSelectBlock}
      />
    </DndContext>
  );
}

/**
 * Drag-overlay layer: invisible draggable markers placed atop each block so
 * the user can grab any block. Because they sit fixed-relative to the page,
 * we render them after the actual NewsletterRender via portal-less absolute
 * positioning anchored to the page-surface elements.
 *
 * For the demo we surface only the drag handle (top-left corner) and rely on
 * @dnd-kit's pointer sensor for the actual move math.
 */
function PerBlockDraggables({
  layout,
  onSelect,
}: {
  layout: AssembledLayout;
  onSelect: (id: string) => void;
}) {
  // We can't easily compute absolute screen positions here without measuring;
  // instead we expose a global "Drag handles" floating tray summarising blocks.
  // (Demo-grade — better than nothing, real implementation would integrate
  // the handles inside BlockView.)
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="fixed top-24 right-[320px] z-20 bg-surface border border-rule rounded-md shadow-card px-3 py-2 max-h-72 overflow-auto pointer-events-auto text-2xs"
      style={{ width: 220 }}
    >
      <div className="font-semibold text-ink mb-1">Drag handles</div>
      <ul>
        {layout.blocks.slice(0, 24).map((b) => (
          <DragHandle key={b.blockId} block={b} onSelect={onSelect} />
        ))}
      </ul>
      {layout.blocks.length > 24 && (
        <div className="text-ink-muted mt-1">
          +{layout.blocks.length - 24} more
        </div>
      )}
    </div>
  );
}

function DragHandle({
  block,
  onSelect,
}: {
  block: LayoutBlock;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.blockId,
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(block.blockId)}
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-grab ${
        isDragging ? "bg-accent-soft" : "hover:bg-bg"
      }`}
    >
      <span className="text-ink-muted">⋮⋮</span>
      <span className="flex-1 truncate">
        p{block.page} · {block.kind}
      </span>
      <span className="text-ink-muted">
        {block.position.col},{block.position.row}
      </span>
    </li>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
