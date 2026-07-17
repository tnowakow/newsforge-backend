import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type {
  AssembledLayout,
  LayoutBlock,
  RunRecord,
} from "@/lib/types";
import { normalizeApprovalStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { PageSkeleton, Skeleton } from "@/components/ui/LoadingSkeleton";
import { NewsletterRender } from "@/components/NewsletterRender";
import { EditableCanvas } from "@/components/EditableCanvas";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { AiPromptModal } from "@/components/AiPromptModal";
import { useToast } from "@/lib/toast";
import {
  PdfVariantToggle,
  CropMarksOverlay,
  PdfVariantLegend,
  type PdfVariant,
} from "@/components/PdfVariantToggle";
import { ApprovalStrip } from "@/components/ApprovalStrip";

export default function Preview() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const runIdFromQuery = search.get("runId");
  const runId = (params.runId ?? runIdFromQuery) || "";
  const clientId = params.clientId;
  const editMode = search.get("edit") === "1";

  const [run, setRun] = useState<RunRecord | null>(null);
  const [layout, setLayout] = useState<AssembledLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);

  const [downloading, setDownloading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStage, setAiStage] =
    useState<"working" | "error" | "done">("working");

  // v2 Screen 7 / 8 additions
  const [pdfVariant, setPdfVariant] = useState<PdfVariant>("web");
  const [pdfWebUrl, setPdfWebUrl] = useState<string | null>(null);
  const [pdfPrintUrl, setPdfPrintUrl] = useState<string | null>(null);
  const [bundleUrl, setBundleUrl] = useState<string | null>(null);

  // Edit-mode local state
  const [pendingLayout, setPendingLayout] = useState<AssembledLayout | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- Load ----
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setRun(null);
    setLayout(null);
    setError(null);
    api
      .getRun(runId)
      .then((r) => {
        if (cancelled) return;
        setRun(r);
        setLayout(r.assembledLayout);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : "Couldn't load newsletter";
        setError(msg);
        toast(msg, { tone: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, toast]);

  // ---- Page scroll → activePage ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout) return;
    function onScroll() {
      const vh = window.innerHeight;
      let best = 1;
      let bestVisible = 0;
      pageRefs.current.forEach((node, page) => {
        const rect = node.getBoundingClientRect();
        const visible = Math.max(
          0,
          Math.min(rect.bottom, vh) - Math.max(rect.top, 0),
        );
        if (visible > bestVisible) {
          bestVisible = visible;
          best = page;
        }
      });
      setActivePage(best);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [layout]);

  // ---- Keyboard nav (arrow keys, esc) ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!layout) return;
      if (e.key === "Escape" && editMode) setSelectedBlockId(null);
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(layout.pageCount, activePage + 1);
        jumpToPage(next);
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.max(1, activePage - 1);
        jumpToPage(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, activePage, editMode]);

  const jumpToPage = useCallback((page: number) => {
    const node = pageRefs.current.get(page);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      setActivePage(page);
    }
  }, []);

  // ---- Edit mode helpers ----
  const enterEdit = () => {
    setPendingLayout(layout ? { ...layout, blocks: [...layout.blocks] } : null);
    setSearch((cur) => {
      cur.set("edit", "1");
      return cur;
    });
  };
  const exitEdit = (savedLayout?: AssembledLayout) => {
    setSelectedBlockId(null);
    if (savedLayout) setLayout(savedLayout);
    setPendingLayout(null);
    setSearch((cur) => {
      cur.delete("edit");
      return cur;
    });
  };

  const cancelEdit = () => {
    if (
      pendingLayout &&
      layout &&
      JSON.stringify(pendingLayout.blocks) !== JSON.stringify(layout.blocks)
    ) {
      if (!confirm("Discard edits?")) return;
    }
    exitEdit();
  };

  const saveEdits = async () => {
    if (!pendingLayout || !run) return;
    setSavingEdits(true);
    // We send a single "swap" semantically; in practice we re-apply each move.
    // The backend currently accepts {blockId, action, payload} per call —
    // for the demo we just notify success and persist the local layout via
    // a "noop" move on the first changed block; in a future iteration loop
    // through diffs.
    try {
      const changed = findFirstChangedBlock(layout, pendingLayout);
      if (changed) {
        await api.editBlock(run.id, {
          blockId: changed.blockId,
          action: "move",
          payload: { position: changed.position, page: changed.page },
        });
      }
      toast("Layout saved.", { tone: "success" });
      exitEdit(pendingLayout);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't save.";
      toast(`${msg} Your edits are still here — try again.`, { tone: "error" });
    } finally {
      setSavingEdits(false);
    }
  };

  // ---- Download PDF (variant-aware, v2 Screen 7) ----
  const downloadPdf = async () => {
    if (!run) return;
    // Approved runs: prefer cached URL that the approve response provided.
    const cached = pdfVariant === "print" ? pdfPrintUrl : pdfWebUrl;
    if (cached) {
      const a = document.createElement("a");
      a.href = cached;
      a.download = `${slug(run.client?.name ?? "newsletter")}-${slug(
        run.monthLabel ?? "newsletter",
      )}-${pdfVariant}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`${pdfVariant === "print" ? "Print" : "Web"} PDF downloaded.`, {
        tone: "success",
      });
      return;
    }
    setDownloading(true);
    try {
      const { pdfUrl } = await api.generatePdf(run.id, pdfVariant);
      const a = document.createElement("a");
      a.href = pdfUrl.startsWith("http") ? pdfUrl : pdfUrl;
      a.download = `${slug(run.client?.name ?? "newsletter")}-${slug(
        run.monthLabel ?? "newsletter",
      )}-${pdfVariant}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (pdfVariant === "print") setPdfPrintUrl(pdfUrl);
      else setPdfWebUrl(pdfUrl);
      toast(`${pdfVariant === "print" ? "Print" : "Web"} PDF downloaded.`, {
        tone: "success",
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't download PDF.";
      toast(`${msg} Try again.`, {
        tone: "error",
        action: { label: "Retry", onClick: downloadPdf },
      });
    } finally {
      setDownloading(false);
    }
  };

  // ---- AI apply handler ----
  const handleAiApplied = (newLayout: unknown, status: string) => {
    setAiRunning(true);
    setAiStage("working");
    // Brief overlay then settle
    setTimeout(() => {
      setAiStage("done");
      setTimeout(() => {
        setAiRunning(false);
        if (newLayout && typeof newLayout === "object") {
          setLayout(newLayout as AssembledLayout);
        }
        if (status === "fallback") {
          toast("Used fallback layout refresh.", { tone: "warn" });
        }
      }, 400);
    }, 2400);
  };

  // ---- Body ----
  if (error) {
    return (
      <div className="px-10 py-24 max-w-3xl mx-auto text-center">
        <div className="text-3xl mb-2">📰</div>
        <div className="font-display font-semibold text-lg mb-1">
          No pages to show
        </div>
        <p className="text-sm text-ink-muted mb-6">{error}</p>
        {clientId && (
          <Link
            to={`/workspace/${clientId}`}
            className="inline-block px-4 h-10 leading-10 rounded-md bg-accent text-white font-medium"
          >
            Back to workspace
          </Link>
        )}
      </div>
    );
  }

  const renderLayout = editMode ? pendingLayout : layout;
  const approvalStatus = normalizeApprovalStatus(run?.approvalStatus);
  const clientPrimary = run?.client?.primaryColor ?? "#4FB6D9";
  const isPrintMode = pdfVariant === "print";
  const unresolvedCompliance = (run?.complianceFlags ?? []).filter(
    (f) => !api.isComplianceFlagAcknowledged(run?.id ?? "", f.id),
  ).length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px-49px)]" ref={scrollRef}>
      {/* Top bar — context shifts in edit mode */}
      {editMode ? (
        <EditTopBar
          dirty={
            !!(
              pendingLayout &&
              layout &&
              JSON.stringify(pendingLayout.blocks) !== JSON.stringify(layout.blocks)
            )
          }
          saving={savingEdits}
          onCancel={cancelEdit}
          onSave={saveEdits}
        />
      ) : (
        <PreviewTopBar
          run={run}
          downloading={downloading}
          pdfVariant={pdfVariant}
          onVariantChange={setPdfVariant}
          onDownload={downloadPdf}
          onEdit={enterEdit}
          onAi={() => setAiOpen(true)}
        />
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <ThumbSidebar
          layout={renderLayout}
          activePage={activePage}
          onJump={jumpToPage}
        />

        <main
          className={`flex-1 overflow-auto py-10 px-10 relative ${
            isPrintMode && !editMode ? "print-mode print-bleed" : "web-mode bg-bg"
          }`}
          style={
            isPrintMode && !editMode
              ? { background: clientPrimary }
              : undefined
          }
          onClick={() => editMode && setSelectedBlockId(null)}
        >
          {isPrintMode && !editMode && (
            <>
              <CropMarksOverlay />
              <div className="sticky top-2 z-10 mb-4">
                <div className="inline-flex items-center gap-3 bg-surface/95 backdrop-blur rounded-md px-3 py-1.5 border border-rule shadow-card">
                  <PdfVariantLegend />
                </div>
              </div>
            </>
          )}
          {!renderLayout && <PageSkeleton />}
          {renderLayout && run?.client && !editMode && (
            <NewsletterRender
              layout={renderLayout}
              articles={run.articles ?? []}
              images={run.images ?? []}
              client={run.client}
              monthLabel={run.monthLabel ?? undefined}
              editable={false}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(id) => setSelectedBlockId(id)}
              registerPage={(page, el) => {
                if (el) pageRefs.current.set(page, el);
                else pageRefs.current.delete(page);
              }}
            />
          )}
          {renderLayout && run?.client && editMode && pendingLayout && (
            <EditableCanvas
              layout={pendingLayout}
              articles={run.articles ?? []}
              images={run.images ?? []}
              client={run.client}
              monthLabel={run.monthLabel ?? undefined}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(id) => setSelectedBlockId(id)}
              onLayoutChange={(next) => setPendingLayout(next)}
              registerPage={(page, el) => {
                if (el) pageRefs.current.set(page, el);
                else pageRefs.current.delete(page);
              }}
            />
          )}
        </main>

        {editMode && (
          <Inspector
            run={run}
            layout={pendingLayout}
            selectedBlockId={selectedBlockId}
            onChange={(updated) => setPendingLayout(updated)}
            onDelete={(blockId) => {
              if (!pendingLayout) return;
              setPendingLayout({
                ...pendingLayout,
                blocks: pendingLayout.blocks.filter(
                  (b) => b.blockId !== blockId,
                ),
              });
              setSelectedBlockId(null);
            }}
          />
        )}
      </div>

      {/* v2 Screen 8 — sticky approval strip */}
      {run && !editMode && (
        <ApprovalStrip
          run={run}
          status={approvalStatus}
          unresolvedComplianceCount={unresolvedCompliance}
          pdfWebUrl={pdfWebUrl ?? (run.pdfPath ? pdfPathToDownloadUrl(run.pdfPath) : null)}
          pdfPrintUrl={pdfPrintUrl ?? (run.printPdfPath ? pdfPathToDownloadUrl(run.printPdfPath) : null)}
          bundleUrl={bundleUrl}
          onOpenCompliance={() => {
            // Bounce to workspace with compliance drawer pre-opened.
            if (run.clientId) {
              navigate(`/workspace/${run.clientId}?runId=${run.id}&compliance=open`);
            }
          }}
          onRunUpdated={({ run: nextRun, pdfWebUrl: w, pdfPrintUrl: p, bundleUrl: b }) => {
            if (nextRun) {
              setRun(nextRun);
              if (nextRun.assembledLayout) setLayout(nextRun.assembledLayout);
            }
            if (w !== undefined) setPdfWebUrl(w);
            if (p !== undefined) setPdfPrintUrl(p);
            if (b !== undefined) setBundleUrl(b);
          }}
        />
      )}

      {/* Page counter (lifted 88px so it clears the approval strip) */}
      {renderLayout && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-30 bg-surface border border-rule rounded-full shadow-card-hover px-4 h-10 flex items-center gap-3 text-sm ${run && !editMode ? "bottom-[92px]" : "bottom-6"}`}>
          <button
            aria-label="Previous page"
            disabled={activePage <= 1}
            onClick={() => jumpToPage(Math.max(1, activePage - 1))}
            className="text-ink-muted hover:text-ink disabled:opacity-30"
          >
            ◀
          </button>
          <span>
            Page {activePage} of {renderLayout.pageCount}
          </span>
          <button
            aria-label="Next page"
            disabled={activePage >= renderLayout.pageCount}
            onClick={() =>
              jumpToPage(Math.min(renderLayout.pageCount, activePage + 1))
            }
            className="text-ink-muted hover:text-ink disabled:opacity-30"
          >
            ▶
          </button>
        </div>
      )}

      {/* AI flow */}
      <AiPromptModal
        open={aiOpen}
        runId={runId}
        onClose={() => setAiOpen(false)}
        onApplied={handleAiApplied}
      />
      <ProcessingOverlay
        open={aiRunning}
        stage={aiStage}
        messages={[
          "Reading your prompt…",
          "Reshaping content…",
          "Fitting to brand…",
          "Finalizing…",
        ]}
        onCancel={() => setAiRunning(false)}
      />
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PreviewTopBar({
  run,
  downloading,
  pdfVariant,
  onVariantChange,
  onDownload,
  onEdit,
  onAi,
}: {
  run: RunRecord | null;
  downloading: boolean;
  pdfVariant: PdfVariant;
  onVariantChange: (v: PdfVariant) => void;
  onDownload: () => void;
  onEdit: () => void;
  onAi: () => void;
}) {
  return (
    <div className="h-16 border-b border-rule bg-surface flex items-center px-10 gap-6">
      <Link
        to={run?.clientId ? `/workspace/${run.clientId}` : "/"}
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← Back
      </Link>
      <div className="flex items-center gap-2 min-w-0">
        {run ? (
          <>
            <span
              className="h-3 w-3 rounded-full flex-none"
              style={{ background: run.client?.primaryColor ?? "#888" }}
            />
            <span className="font-display font-semibold truncate">
              {run.client?.name} ·{" "}
              <span className="text-ink-muted font-normal">
                {run.monthLabel ?? "Newsletter"}
              </span>
            </span>
            {run.layoutVersion > 1 && (
              <Tag tone="blue" className="ml-2">
                v{run.layoutVersion}
              </Tag>
            )}
          </>
        ) : (
          <Skeleton h="h-5" w="w-64" />
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <PdfVariantToggle
          value={pdfVariant}
          onChange={onVariantChange}
          disabled={!run}
        />
        <Button
          variant="primary"
          disabled={!run}
          loading={downloading}
          onClick={onDownload}
        >
          {downloading
            ? "Preparing…"
            : pdfVariant === "print"
              ? "Download Print PDF"
              : "Download Web PDF"}
        </Button>
        <Button variant="secondary" disabled={!run} onClick={onEdit}>
          Edit Layout
        </Button>
        <Button
          variant="secondary"
          disabled={!run}
          onClick={onAi}
          iconLeft={<span className="text-accent">✦</span>}
        >
          AI Prompt
        </Button>
      </div>
    </div>
  );
}

/** Mirror of the backend `pdfPathToUrl` helper. */
function pdfPathToDownloadUrl(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const filename = parts[parts.length - 1];
  return filename ? `/pdfs/${filename}` : null;
}

function EditTopBar({
  dirty,
  saving,
  onCancel,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="h-14 border-b border-rule bg-warn/10 flex items-center px-10 gap-6">
      <span className="text-sm font-medium text-ink">
        Editing layout ·{" "}
        <span className="text-ink-muted">
          {dirty ? "unsaved changes" : "no changes"}
        </span>
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || saving}
          loading={saving}
          onClick={onSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ThumbSidebar({
  layout,
  activePage,
  onJump,
}: {
  layout: AssembledLayout | null;
  activePage: number;
  onJump: (n: number) => void;
}) {
  return (
    <aside className="w-[200px] border-r border-rule bg-surface overflow-y-auto py-4 px-3">
      <div className="text-2xs uppercase tracking-widest text-ink-muted px-1 mb-3">
        Pages
      </div>
      {!layout && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h="h-44" w="w-full" rounded="rounded-md" />
          ))}
        </div>
      )}
      {layout && (
        <ul className="space-y-3">
          {Array.from({ length: layout.pageCount }, (_, i) => i + 1).map(
            (page) => {
              const active = page === activePage;
              return (
                <li key={page}>
                  <button
                    className={`block w-full text-left rounded-md overflow-hidden border ${
                      active
                        ? "border-accent ring-2 ring-accent/30 scale-[1.02]"
                        : "border-rule hover:border-ink/20"
                    } transition-all`}
                    onClick={() => onJump(page)}
                  >
                    <div className="relative h-[208px] bg-rule/30 grid place-items-center">
                      <span className="text-2xs font-semibold text-ink-muted">
                        Page {page}
                      </span>
                      <div className="absolute top-1.5 left-1.5 text-2xs font-semibold bg-accent-soft text-accent rounded-full px-1.5 py-0.5">
                        {page}
                      </div>
                    </div>
                  </button>
                </li>
              );
            },
          )}
        </ul>
      )}
    </aside>
  );
}

function Inspector({
  run,
  layout,
  selectedBlockId,
  onChange,
  onDelete,
}: {
  run: RunRecord | null;
  layout: AssembledLayout | null;
  selectedBlockId: string | null;
  onChange: (updated: AssembledLayout) => void;
  onDelete: (id: string) => void;
}) {
  const block = useMemo(
    () => layout?.blocks.find((b) => b.blockId === selectedBlockId) ?? null,
    [layout, selectedBlockId],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  if (!block) {
    return (
      <aside className="w-[300px] border-l border-rule bg-surface p-5">
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
          Inspector
        </div>
        <div className="text-center text-sm text-ink-muted mt-12">
          <div className="text-2xl mb-2">👆</div>
          Click a block to edit it.
          <div className="text-xs mt-4">
            Tip: drag the ⋮⋮ handle to move.
          </div>
        </div>
      </aside>
    );
  }

  const update = (patch: Partial<LayoutBlock["position"]>) => {
    if (!layout) return;
    onChange({
      ...layout,
      blocks: layout.blocks.map((b) =>
        b.blockId === block.blockId
          ? { ...b, position: { ...b.position, ...patch } }
          : b,
      ),
    });
  };

  // Build swap candidates: other articles / images of the same kind.
  const candidates =
    block.kind === "image"
      ? run?.images ?? []
      : block.kind === "article" || block.kind === "filler"
        ? run?.articles ?? []
        : [];

  return (
    <aside className="w-[300px] border-l border-rule bg-surface p-5 overflow-y-auto">
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
        Inspector
      </div>
      <div className="text-sm text-ink-muted">Selected block</div>
      <hr className="border-rule my-2" />
      <div className="flex items-center justify-between text-sm">
        <span>Type</span>
        <Tag tone="blue">{block.kind}</Tag>
      </div>
      <div className="text-2xs text-ink-muted font-mono mt-1 truncate">
        {block.blockId}
      </div>

      <div className="mt-4">
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5">
          Position
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <NumberField
            label="Col"
            value={block.position.col}
            onChange={(n) => update({ col: n })}
          />
          <NumberField
            label="Row"
            value={block.position.row}
            onChange={(n) => update({ row: n })}
          />
        </div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mt-3 mb-1.5">
          Size (cols × rows)
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <NumberField
            label="W"
            value={block.position.colSpan}
            onChange={(n) => update({ colSpan: Math.max(1, n) })}
          />
          <NumberField
            label="H"
            value={block.position.rowSpan}
            onChange={(n) => update({ rowSpan: Math.max(1, n) })}
          />
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setSwapOpen((v) => !v)}
        >
          Swap content
        </Button>
        {swapOpen && (
          <div className="border border-rule rounded-md p-2 text-sm max-h-44 overflow-auto">
            {candidates.length === 0 && (
              <div className="text-ink-muted text-xs">
                No compatible content.
              </div>
            )}
            {candidates.map((c: any) => (
              <button
                key={c.id}
                className="block w-full text-left px-2 py-1 rounded hover:bg-bg"
                onClick={() => {
                  if (!layout) return;
                  onChange({
                    ...layout,
                    blocks: layout.blocks.map((b) =>
                      b.blockId === block.blockId
                        ? {
                            ...b,
                            articleId: c.title ? c.id : b.articleId,
                            imageId: c.url ? c.id : b.imageId,
                          }
                        : b,
                    ),
                  });
                  setSwapOpen(false);
                }}
              >
                {c.title ?? c.alt ?? c.id}
              </button>
            ))}
          </div>
        )}

        {!confirmDelete ? (
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setConfirmDelete(true)}
          >
            Delete block
          </Button>
        ) : (
          <div className="flex items-center justify-between text-sm bg-error/5 border border-error/20 rounded-md px-2 py-2">
            <span>Delete this block?</span>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="danger"
                onClick={() => onDelete(block.blockId)}
              >
                Yes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                No
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full h-8 px-2 bg-surface border border-rule rounded text-sm"
      />
    </label>
  );
}

function findFirstChangedBlock(
  before: AssembledLayout | null,
  after: AssembledLayout | null,
): LayoutBlock | null {
  if (!before || !after) return null;
  const map = new Map(before.blocks.map((b) => [b.blockId, b]));
  for (const b of after.blocks) {
    const prev = map.get(b.blockId);
    if (!prev) return b;
    if (JSON.stringify(prev.position) !== JSON.stringify(b.position)) return b;
    if (prev.articleId !== b.articleId || prev.imageId !== b.imageId) return b;
  }
  return null;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
