import { useEffect } from "react";
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

export function EditableCanvas(props: EditableCanvasProps) {
  const selectedBlock = props.layout.blocks.find(
    (b) => b.blockId === props.selectedBlockId,
  );

  const updateBlock = (
    blockId: string,
    updater: (block: LayoutBlock) => LayoutBlock,
  ) => {
    props.onLayoutChange({
      ...props.layout,
      blocks: props.layout.blocks.map((b) =>
        b.blockId === blockId ? updater(b) : b,
      ),
    });
  };

  const moveBlock = (blockId: string, dCol: number, dRow: number) => {
    updateBlock(blockId, (block) => {
      const maxCol = COL_COUNT - block.position.colSpan + 1;
      return {
        ...block,
        position: {
          ...block.position,
          col: clamp(block.position.col + dCol, 1, maxCol),
          row: Math.max(1, block.position.row + dRow),
        },
      };
    });
  };

  const resizeBlock = (
    blockId: string,
    dColSpan: number,
    dRowSpan: number,
  ) => {
    updateBlock(blockId, (block) => {
      const maxSpan = COL_COUNT - block.position.col + 1;
      return {
        ...block,
        position: {
          ...block.position,
          colSpan: clamp(block.position.colSpan + dColSpan, 1, maxSpan),
          rowSpan: Math.max(1, block.position.rowSpan + dRowSpan),
        },
      };
    });
  };

  const duplicateBlock = (blockId: string) => {
    const block = props.layout.blocks.find((b) => b.blockId === blockId);
    if (!block) return;
    const duplicate: LayoutBlock = {
      ...block,
      blockId: `block-${Date.now()}`,
      slotId: `custom-${Date.now()}`,
      position: {
        ...block.position,
        row: block.position.row + block.position.rowSpan + 1,
      },
    };
    props.onLayoutChange({
      ...props.layout,
      blocks: [...props.layout.blocks, duplicate],
    });
    props.onSelectBlock(duplicate.blockId);
  };

  const layerBlock = (blockId: string, direction: "forward" | "backward") => {
    const values = props.layout.blocks.map((b) => b.zIndex ?? 0);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    updateBlock(blockId, (block) => ({
      ...block,
      zIndex:
        direction === "forward"
          ? Math.max(block.zIndex ?? 0, max) + 1
          : Math.min(block.zIndex ?? 0, min) - 1,
    }));
  };

  const deleteBlock = (blockId: string) => {
    props.onLayoutChange({
      ...props.layout,
      blocks: props.layout.blocks.filter((b) => b.blockId !== blockId),
    });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = e.target as HTMLElement | null;
      if (
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT"
      ) {
        return;
      }
      if (!props.selectedBlockId) return;
      const step = e.shiftKey ? 2 : 1;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteBlock(props.selectedBlockId);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.altKey
          ? resizeBlock(props.selectedBlockId, -step, 0)
          : moveBlock(props.selectedBlockId, -step, 0);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.altKey
          ? resizeBlock(props.selectedBlockId, step, 0)
          : moveBlock(props.selectedBlockId, step, 0);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.altKey
          ? resizeBlock(props.selectedBlockId, 0, -step)
          : moveBlock(props.selectedBlockId, 0, -step);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.altKey
          ? resizeBlock(props.selectedBlockId, 0, step)
          : moveBlock(props.selectedBlockId, 0, step);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.layout, props.selectedBlockId]);

  return (
    <div className="relative">
      <div className="sticky top-3 z-20 mx-auto mb-4 w-fit rounded-md border border-rule bg-surface/95 px-3 py-2 text-xs shadow-card backdrop-blur">
        {selectedBlock ? (
          <span>
            Selected p{selectedBlock.page} · {selectedBlock.kind} · col{" "}
            {selectedBlock.position.col}, row {selectedBlock.position.row}, size{" "}
            {selectedBlock.position.colSpan}x{selectedBlock.position.rowSpan}
          </span>
        ) : (
          <span>Click a block, then use the on-page controls or arrow keys.</span>
        )}
        <span className="ml-3 text-ink-muted">
          Alt+arrows resize · Shift moves faster · Delete removes
        </span>
      </div>
      <NewsletterRender
        layout={props.layout}
        articles={props.articles}
        images={props.images}
        client={props.client}
        monthLabel={props.monthLabel}
        editable
        selectedBlockId={props.selectedBlockId}
        onSelectBlock={props.onSelectBlock}
        onMoveBlock={moveBlock}
        onResizeBlock={resizeBlock}
        onDuplicateBlock={duplicateBlock}
        onDeleteBlock={deleteBlock}
        onLayerBlock={layerBlock}
        registerPage={props.registerPage}
      />
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
