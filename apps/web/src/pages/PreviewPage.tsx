import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  NewsletterRunDto,
  ClientFullDto,
  LayoutBlock,
  EditOp,
} from "@newsforge/shared";
import {
  getRun,
  getClient,
  renderUrl,
  downloadPdf,
  editRun,
} from "../api/endpoints";
import { ApiError } from "../api/client";
import { applyBrandColors, resetBrandColors } from "../lib/brand";
import { applyClientFonts } from "../lib/fonts";
import { AIPromptModal } from "../components/AIPromptModal";
import { ErrorState, LoadingSkeleton } from "../components/states";
import { ClientLogo } from "../components/ClientLogo";
import { cn } from "../lib/cn";

interface SelectedBlock {
  pageNumber: number;
  block: LayoutBlock;
}

export function PreviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<NewsletterRunDto | null>(null);
  const [client, setClient] = useState<ClientFullDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [pendingOps, setPendingOps] = useState<EditOp[]>([]);
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadRun = useCallback(async () => {
    if (!runId) return;
    setLoadError(null);
    try {
      const { run: r } = await getRun(runId);
      setRun(r);
      const { client: c } = await getClient(r.clientId);
      setClient(c);
      applyBrandColors({
        primary: c.primaryColor,
        secondary: c.secondaryColor,
        accent: c.accentColor,
      });
      applyClientFonts(c.headingFont, c.bodyFont);
    } catch (e: unknown) {
      setLoadError(
        e instanceof ApiError && e.status === 404
          ? "We couldn't find that newsletter run."
          : "Couldn't load this newsletter. Please try again.",
      );
    }
  }, [runId]);

  useEffect(() => {
    void loadRun();
    return () => {
      resetBrandColors();
    };
  }, [loadRun]);

  // Scroll the iframe to the active page when the thumbnail is clicked.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      const el = win.document.querySelector(
        `[data-page="${activePage}"]`,
      ) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* cross-origin in some setups — fall back to no-op. */
    }
  }, [activePage]);

  const pages = run?.assembledLayout.pages ?? [];
  const totalPages = pages.length;

  const iframeSrc = useMemo(() => {
    if (!run) return "";
    // Force reload after layoutVersion changes so edits show up.
    return `${renderUrl(run.id)}?v=${run.layoutVersion}`;
  }, [run]);

  async function handleDownloadPdf() {
    if (!run) return;
    setDownloading(true);
    setStatusMsg(null);
    try {
      const { blob, filename } = await downloadPdf(run.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `newsforge-${run.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatusMsg("PDF downloaded.");
    } catch (e: unknown) {
      setStatusMsg(
        e instanceof ApiError
          ? "PDF generation failed. Please try again."
          : "PDF generation failed. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  function enterEditMode() {
    setEditMode(true);
    setPendingOps([]);
    setSelected(null);
  }
  function cancelEdits() {
    setEditMode(false);
    setPendingOps([]);
    setSelected(null);
  }
  async function saveEdits() {
    if (!run || pendingOps.length === 0) {
      setEditMode(false);
      return;
    }
    setSavingEdits(true);
    setStatusMsg(null);
    try {
      const res = await editRun(run.id, { ops: pendingOps });
      setRun(res.run);
      setPendingOps([]);
      setSelected(null);
      setEditMode(false);
      setStatusMsg("Edits saved.");
    } catch (e: unknown) {
      setStatusMsg(
        e instanceof ApiError
          ? e.body?.message ?? "Couldn't save edits."
          : "Couldn't save edits.",
      );
    } finally {
      setSavingEdits(false);
    }
  }

  function stagePendingOp(op: EditOp) {
    setPendingOps((prev) => [...prev, op]);
  }

  if (loadError) {
    return (
      <div className="px-8 py-10">
        <ErrorState
          title="Newsletter unavailable"
          message={loadError}
          onRetry={() => void loadRun()}
        />
        <div className="text-center mt-4">
          <Link to="/" className="text-sm text-porter hover:underline">
            ← Start over
          </Link>
        </div>
      </div>
    );
  }

  if (!run || !client) {
    return (
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <LoadingSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-slate-100">
      {/* Top action bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <ClientLogo logoUrl={client.logoUrl} name={client.name} size={32} />
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate">
            {client.name}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {run.monthLabel} · v{run.layoutVersion}
          </div>
        </div>
        <div className="flex-1" />

        {statusMsg && (
          <span className="text-xs text-slate-600 bg-slate-100 rounded px-2 py-1">
            {statusMsg}
          </span>
        )}

        <span className="text-sm text-slate-500">
          Page <strong>{activePage}</strong> of {totalPages}
        </span>

        {!editMode ? (
          <>
            <button
              className="btn-secondary"
              onClick={enterEditMode}
              title="Manually move, resize or delete blocks"
            >
              ✏️ Edit Layout
            </button>
            <button
              className="btn-secondary"
              onClick={() => setAiOpen(true)}
              title="Ask Gemini to make a layout change"
            >
              ✨ AI Prompt
            </button>
            <button
              className="btn-primary"
              onClick={handleDownloadPdf}
              disabled={downloading}
            >
              {downloading ? "Generating…" : "⬇ Download PDF"}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            <span className="text-xs text-amber-700 font-medium">
              Edit mode · {pendingOps.length} pending change
              {pendingOps.length === 1 ? "" : "s"}
            </span>
            <button className="btn-ghost text-xs" onClick={cancelEdits}>
              Cancel
            </button>
            <button
              className="btn-primary text-sm py-1.5"
              onClick={saveEdits}
              disabled={savingEdits}
            >
              {savingEdits ? "Saving…" : "Save edits"}
            </button>
          </div>
        )}
      </div>

      {/* Main layout: thumbs | preview | inspector(when editing) */}
      <div className="flex-1 flex min-h-0">
        <ThumbnailSidebar
          pages={pages}
          activePage={activePage}
          onSelect={setActivePage}
        />

        <div className="flex-1 flex min-h-0 relative">
          <div className="flex-1 overflow-auto bg-slate-200 p-6">
            <div className="bg-white shadow-lg rounded mx-auto max-w-[820px] min-h-full overflow-hidden">
              <iframe
                ref={iframeRef}
                key={iframeSrc}
                src={iframeSrc}
                title="Newsletter preview"
                className="w-full h-[1100px]"
              />
            </div>
          </div>

          {editMode && (
            <EditOverlay
              run={run}
              activePage={activePage}
              selected={selected}
              onSelect={setSelected}
              onStage={stagePendingOp}
              onClearSelection={() => setSelected(null)}
            />
          )}
        </div>
      </div>

      <div className="bg-white border-t border-slate-200 px-6 py-2 text-xs text-slate-500 flex items-center justify-between">
        <Link to="/" className="hover:text-porter">
          ← Start over
        </Link>
        <button
          onClick={() => navigate(`/clients/${client.id}`)}
          className="hover:text-porter"
        >
          Back to workspace
        </button>
      </div>

      <AIPromptModal
        runId={run.id}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onApplied={() => void loadRun()}
      />
    </div>
  );
}

/* ---------- Thumbnails ---------- */

function ThumbnailSidebar({
  pages,
  activePage,
  onSelect,
}: {
  pages: NewsletterRunDto["assembledLayout"]["pages"];
  activePage: number;
  onSelect: (n: number) => void;
}) {
  return (
    <aside className="w-44 bg-white border-r border-slate-200 overflow-y-auto p-3 shrink-0">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-400 mb-2 px-1">
        Pages
      </h3>
      <ul className="space-y-2">
        {pages.map((p) => {
          const active = p.pageNumber === activePage;
          return (
            <li key={p.pageNumber}>
              <button
                onClick={() => onSelect(p.pageNumber)}
                className={cn(
                  "w-full block text-left rounded border-2 overflow-hidden transition-all",
                  active
                    ? "border-brand-primary shadow-md"
                    : "border-slate-200 hover:border-slate-300",
                )}
                aria-current={active ? "page" : undefined}
              >
                <ThumbnailSvg page={p} />
                <div className="bg-white px-2 py-1 text-xs flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    Page {p.pageNumber}
                  </span>
                  <span className="text-slate-400">{p.blocks.length}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function ThumbnailSvg({
  page,
}: {
  page: NewsletterRunDto["assembledLayout"]["pages"][number];
}) {
  const cols = page.template.gridCols;
  const rows = page.template.gridRows;
  const W = 140;
  const H = Math.round(W * 1.3);
  const cellW = W / cols;
  const cellH = H / rows;
  const colorFor = (t: LayoutBlock["type"]): string => {
    switch (t) {
      case "headline":
      case "masthead":
        return "rgb(var(--brand-primary-rgb))";
      case "image":
      case "gallery":
        return "rgb(var(--brand-accent-rgb))";
      case "sidebar":
        return "rgb(var(--brand-secondary-rgb))";
      case "body":
      case "footer":
      default:
        return "#cbd5e1";
    }
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="bg-white block">
      {page.blocks.map((b) => (
        <rect
          key={b.id}
          x={b.x * cellW}
          y={b.y * cellH}
          width={b.w * cellW}
          height={b.h * cellH}
          fill={colorFor(b.type)}
          fillOpacity={0.85}
          stroke="white"
          strokeWidth={1}
          rx={1}
        />
      ))}
    </svg>
  );
}

/* ---------- Edit overlay + Inspector ---------- */

function EditOverlay({
  run,
  activePage,
  selected,
  onSelect,
  onStage,
  onClearSelection,
}: {
  run: NewsletterRunDto;
  activePage: number;
  selected: SelectedBlock | null;
  onSelect: (s: SelectedBlock | null) => void;
  onStage: (op: EditOp) => void;
  onClearSelection: () => void;
}) {
  const page = run.assembledLayout.pages.find((p) => p.pageNumber === activePage);

  return (
    <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto shrink-0">
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Edit blocks</h3>
        <p className="text-xs text-slate-500 mt-1">
          Click a block on page {activePage} to edit it.
        </p>
      </div>

      {!page && (
        <p className="p-4 text-sm text-slate-500">Page not found.</p>
      )}

      {page && (
        <div className="p-4 border-b border-slate-100">
          <h4 className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">
            Blocks on this page
          </h4>
          <ul className="space-y-1">
            {page.blocks.map((b) => {
              const isSelected =
                selected?.pageNumber === activePage && selected.block.id === b.id;
              return (
                <li key={b.id}>
                  <button
                    onClick={() =>
                      onSelect({ pageNumber: activePage, block: b })
                    }
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors",
                      isSelected
                        ? "bg-brand-primary/10 ring-2 ring-brand-primary text-slate-900"
                        : "hover:bg-slate-50 text-slate-700",
                    )}
                  >
                    <BlockGlyph type={b.type} />
                    <span className="font-medium truncate flex-1">
                      {b.type}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {b.w}×{b.h}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected && (
        <Inspector
          selected={selected}
          gridCols={page?.template.gridCols ?? 12}
          gridRows={page?.template.gridRows ?? 16}
          onStage={onStage}
          onSelect={onSelect}
          onClear={onClearSelection}
        />
      )}
    </aside>
  );
}

function Inspector({
  selected,
  gridCols,
  gridRows,
  onStage,
  onSelect,
  onClear,
}: {
  selected: SelectedBlock;
  gridCols: number;
  gridRows: number;
  onStage: (op: EditOp) => void;
  onSelect: (s: SelectedBlock) => void;
  onClear: () => void;
}) {
  const { pageNumber, block } = selected;

  function commit(next: Partial<Pick<LayoutBlock, "x" | "y" | "w" | "h">>) {
    const updated: LayoutBlock = { ...block, ...next };
    onSelect({ pageNumber, block: updated });
    if (next.x !== undefined || next.y !== undefined) {
      onStage({
        op: "move",
        pageNumber,
        blockId: updated.id,
        x: updated.x,
        y: updated.y,
      });
    }
    if (next.w !== undefined || next.h !== undefined) {
      onStage({
        op: "resize",
        pageNumber,
        blockId: updated.id,
        w: updated.w,
        h: updated.h,
      });
    }
  }

  function swapToPlaceholder() {
    onStage({
      op: "swap-content",
      pageNumber,
      blockId: block.id,
      contentRef: { kind: "placeholder" },
    });
  }
  function deleteBlock() {
    onStage({ op: "delete", pageNumber, blockId: block.id });
    onClear();
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-slate-400">
          Selected
        </div>
        <div className="font-semibold text-slate-900 flex items-center gap-2 mt-1">
          <BlockGlyph type={block.type} />
          {block.type}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 font-mono">
          {block.id}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="X"
          value={block.x}
          min={0}
          max={gridCols - 1}
          onChange={(v) => commit({ x: v })}
        />
        <NumField
          label="Y"
          value={block.y}
          min={0}
          max={gridRows - 1}
          onChange={(v) => commit({ y: v })}
        />
        <NumField
          label="W"
          value={block.w}
          min={1}
          max={gridCols}
          onChange={(v) => commit({ w: v })}
        />
        <NumField
          label="H"
          value={block.h}
          min={1}
          max={gridRows}
          onChange={(v) => commit({ h: v })}
        />
      </div>

      <div className="space-y-2">
        <button className="btn-secondary w-full" onClick={swapToPlaceholder}>
          ↻ Swap Content
        </button>
        <button
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-rose-700 border border-rose-200 hover:bg-rose-50"
          onClick={deleteBlock}
        >
          🗑 Delete block
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="input mt-1"
      />
    </label>
  );
}

function BlockGlyph({ type }: { type: LayoutBlock["type"] }) {
  const map: Record<LayoutBlock["type"], string> = {
    headline: "🅷",
    masthead: "▤",
    image: "🖼",
    gallery: "🖻",
    body: "¶",
    sidebar: "▮",
    footer: "▭",
  };
  return (
    <span className="w-5 h-5 rounded bg-slate-100 text-slate-600 text-xs inline-flex items-center justify-center">
      {map[type]}
    </span>
  );
}
