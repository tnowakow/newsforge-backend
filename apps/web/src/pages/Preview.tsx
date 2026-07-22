import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type {
  Article,
  AssembledLayout,
  LayoutBlock,
  NewsImage,
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

interface EditorSnapshot {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
}

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
  const [pendingArticles, setPendingArticles] = useState<Article[]>([]);
  const [pendingImages, setPendingImages] = useState<NewsImage[]>([]);
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
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
      if (editMode) return;
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
    setPendingLayout(cloneLayout(layout));
    setPendingArticles(cloneList(run?.articles ?? []));
    setPendingImages(cloneList(run?.images ?? []));
    setUndoStack([]);
    setRedoStack([]);
    setSearch((cur) => {
      cur.set("edit", "1");
      return cur;
    });
  };
  const exitEdit = (savedLayout?: AssembledLayout) => {
    setSelectedBlockId(null);
    if (savedLayout) setLayout(savedLayout);
    setPendingLayout(null);
    setUndoStack([]);
    setRedoStack([]);
    setSearch((cur) => {
      cur.delete("edit");
      return cur;
    });
  };

  const cancelEdit = () => {
    if (
      pendingLayout &&
      layout &&
      isDocumentDirty(
        layout,
        run?.articles ?? [],
        run?.images ?? [],
        pendingLayout,
        pendingArticles,
        pendingImages,
      )
    ) {
      if (!confirm("Discard edits?")) return;
    }
    exitEdit();
  };

  const saveEdits = async () => {
    if (!pendingLayout || !run) return;
    setSavingEdits(true);
    try {
      const updated = await api.saveDocument(run.id, {
        layout: pendingLayout,
        articles: pendingArticles,
        images: pendingImages,
      });
      toast("Layout saved.", { tone: "success" });
      setRun(updated);
      exitEdit(updated.assembledLayout);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't save.";
      toast(`${msg} Your edits are still here — try again.`, { tone: "error" });
    } finally {
      setSavingEdits(false);
    }
  };

  const currentEditorSnapshot = (): EditorSnapshot | null =>
    pendingLayout
      ? {
          layout: cloneLayout(pendingLayout)!,
          articles: cloneList(pendingArticles),
          images: cloneList(pendingImages),
        }
      : null;

  const applyEditorSnapshot = (snapshot: EditorSnapshot) => {
    setPendingLayout(cloneLayout(snapshot.layout));
    setPendingArticles(cloneList(snapshot.articles));
    setPendingImages(cloneList(snapshot.images));
  };

  const recordEditorHistory = () => {
    const snapshot = currentEditorSnapshot();
    if (!snapshot) return;
    setUndoStack((cur) => [...cur.slice(-24), snapshot]);
    setRedoStack([]);
  };

  const changePendingLayout = (next: AssembledLayout) => {
    recordEditorHistory();
    setPendingLayout(next);
  };

  const changePendingArticles = (next: Article[]) => {
    recordEditorHistory();
    setPendingArticles(next);
  };

  const changePendingImages = (next: NewsImage[]) => {
    recordEditorHistory();
    setPendingImages(next);
  };

  const undoEdit = () => {
    const previous = undoStack[undoStack.length - 1];
    const current = currentEditorSnapshot();
    if (!previous || !current) return;
    setUndoStack((cur) => cur.slice(0, -1));
    setRedoStack((cur) => [...cur.slice(-24), current]);
    applyEditorSnapshot(previous);
  };

  const redoEdit = () => {
    const next = redoStack[redoStack.length - 1];
    const current = currentEditorSnapshot();
    if (!next || !current) return;
    setRedoStack((cur) => cur.slice(0, -1));
    setUndoStack((cur) => [...cur.slice(-24), current]);
    applyEditorSnapshot(next);
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
              isDocumentDirty(
                layout,
                run?.articles ?? [],
                run?.images ?? [],
                pendingLayout,
                pendingArticles,
                pendingImages,
              )
            )
          }
          saving={savingEdits}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undoEdit}
          onRedo={redoEdit}
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
              articles={pendingArticles}
              images={pendingImages}
              client={run.client}
              monthLabel={run.monthLabel ?? undefined}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(id) => setSelectedBlockId(id)}
              onLayoutChange={changePendingLayout}
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
            articles={pendingArticles}
            images={pendingImages}
            activePage={activePage}
            selectedBlockId={selectedBlockId}
            onChange={changePendingLayout}
            onArticlesChange={changePendingArticles}
            onImagesChange={changePendingImages}
            onSelectBlock={setSelectedBlockId}
            onDelete={(blockId) => {
              if (!pendingLayout) return;
              changePendingLayout({
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCancel,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
        <Button variant="secondary" onClick={onUndo} disabled={!canUndo || saving}>
          Undo
        </Button>
        <Button variant="secondary" onClick={onRedo} disabled={!canRedo || saving}>
          Redo
        </Button>
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
  articles,
  images,
  activePage,
  selectedBlockId,
  onChange,
  onArticlesChange,
  onImagesChange,
  onSelectBlock,
  onDelete,
}: {
  run: RunRecord | null;
  layout: AssembledLayout | null;
  articles: Article[];
  images: NewsImage[];
  activePage: number;
  selectedBlockId: string | null;
  onChange: (updated: AssembledLayout) => void;
  onArticlesChange: (updated: Article[]) => void;
  onImagesChange: (updated: NewsImage[]) => void;
  onSelectBlock: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const block = useMemo(
    () => layout?.blocks.find((b) => b.blockId === selectedBlockId) ?? null,
    [layout, selectedBlockId],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [assetUrl, setAssetUrl] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!block) {
    return (
      <aside className="w-[340px] border-l border-rule bg-surface p-5 overflow-y-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
          Create
        </div>
        <p className="text-sm text-ink-muted mb-4">
          Add a new editable section to page {activePage}, then move and resize
          it from the inspector.
        </p>
        <div className="space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (!layout) return;
              const article = makeArticle();
              const block = makeBlock("article", activePage, {
                articleId: article.id,
                styleTag: "feature",
              });
              onArticlesChange([...articles, article]);
              onChange({ ...layout, blocks: [...layout.blocks, block] });
              onSelectBlock(block.blockId);
            }}
          >
            Add text section
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (!layout) return;
              const image = makeImage();
              const block = makeBlock("image", activePage, {
                imageId: image.id,
                styleTag: "photo",
              });
              onImagesChange([...images, image]);
              onChange({ ...layout, blocks: [...layout.blocks, block] });
              onSelectBlock(block.blockId);
            }}
          >
            Add image frame
          </Button>
          <div className="pt-3">
            <div className="mb-2 text-2xs uppercase tracking-widest text-ink-muted">
              Section templates
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    if (!layout) return;
                    const inserted = insertSectionTemplate(
                      template,
                      layout,
                      articles,
                      images,
                      activePage,
                    );
                    onArticlesChange(inserted.articles);
                    onImagesChange(inserted.images);
                    onChange(inserted.layout);
                    onSelectBlock(inserted.selectedBlockId);
                  }}
                  className="rounded border border-rule bg-bg px-2 py-2 text-left text-xs hover:border-accent hover:bg-accent-soft"
                >
                  <div className="font-medium text-ink">{template.label}</div>
                  <div className="mt-0.5 text-2xs text-ink-muted">
                    {template.help}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const updatePosition = (patch: Partial<LayoutBlock["position"]>) => {
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
  const updateBlock = (patch: Partial<LayoutBlock>) => {
    if (!layout) return;
    onChange({
      ...layout,
      blocks: layout.blocks.map((b) =>
        b.blockId === block.blockId ? { ...b, ...patch } : b,
      ),
    });
  };
  const article = block.articleId
    ? articles.find((a) => a.id === block.articleId)
    : null;
  const image = block.imageId ? images.find((i) => i.id === block.imageId) : null;
  const updateArticle = (patch: Partial<Article>) => {
    if (!article) return;
    onArticlesChange(
      articles.map((a) =>
        a.id === article.id
          ? {
              ...a,
              ...patch,
              wordCount:
                patch.body !== undefined
                  ? countWords(patch.body)
                  : patch.wordCount ?? a.wordCount,
            }
          : a,
      ),
    );
  };
  const updateImage = (patch: Partial<NewsImage>) => {
    if (!image) return;
    onImagesChange(images.map((i) => (i.id === image.id ? { ...i, ...patch } : i)));
  };

  // Build swap candidates: other articles / images of the same kind.
  const candidates =
    block.kind === "image"
      ? images
      : block.kind === "article" || block.kind === "filler"
        ? articles
        : [];

  return (
    <aside className="w-[340px] border-l border-rule bg-surface p-5 overflow-y-auto">
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
            min={1}
            max={12}
            onChange={(n) => updatePosition({ col: clamp(n, 1, 12) })}
          />
          <NumberField
            label="Row"
            value={block.position.row}
            min={1}
            onChange={(n) => updatePosition({ row: Math.max(1, n) })}
          />
        </div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mt-3 mb-1.5">
          Size (cols × rows)
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <NumberField
            label="W"
            value={block.position.colSpan}
            min={1}
            max={12}
            onChange={(n) => updatePosition({ colSpan: clamp(n, 1, 12) })}
          />
          <NumberField
            label="H"
            value={block.position.rowSpan}
            min={1}
            onChange={(n) => updatePosition({ rowSpan: Math.max(1, n) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm mt-3">
          <NumberField
            label="Page"
            value={block.page}
            min={1}
            max={layout?.pageCount ?? 4}
            onChange={(n) => updateBlock({ page: clamp(n, 1, layout?.pageCount ?? 4) })}
          />
          <NumberField
            label="Layer"
            value={block.zIndex ?? 0}
            onChange={(zIndex) => updateBlock({ zIndex })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm mt-3">
          <label className="block">
            <span className="block text-2xs text-ink-muted mb-0.5">Style</span>
            <select
              value={block.styleTag ?? ""}
              onChange={(e) => updateBlock({ styleTag: e.target.value || undefined })}
              className="w-full h-8 px-2 bg-surface border border-rule rounded text-sm"
            >
              <option value="">Plain</option>
              <option value="hero">Hero</option>
              <option value="feature">Feature</option>
              <option value="banner">Banner</option>
              <option value="spotlight">Spotlight</option>
              <option value="pull-quote">Pull quote</option>
              <option value="photo">Photo</option>
            </select>
          </label>
        </div>
      </div>

      {article && (
        <div className="mt-5 space-y-2">
          <div className="text-2xs uppercase tracking-widest text-ink-muted">
            Text
          </div>
          <TextField
            label="Title"
            value={article.title}
            onChange={(title) => updateArticle({ title })}
          />
          <TextField
            label="Byline"
            value={article.byline ?? ""}
            onChange={(byline) => updateArticle({ byline: byline || undefined })}
          />
          <label className="block">
            <span className="block text-2xs text-ink-muted mb-0.5">Body</span>
            <textarea
              value={article.body}
              onChange={(e) => updateArticle({ body: e.target.value })}
              rows={8}
              className="w-full px-2 py-2 bg-surface border border-rule rounded text-sm leading-snug"
            />
          </label>
          <div className="text-2xs text-ink-muted">
            {countWords(article.body)} words
          </div>
        </div>
      )}

      {image && (
        <div className="mt-5 space-y-2">
          <div className="text-2xs uppercase tracking-widest text-ink-muted">
            Image
          </div>
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {images.slice(0, 12).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  title={candidate.alt ?? candidate.caption ?? candidate.id}
                  onClick={() => updateBlock({ imageId: candidate.id })}
                  className={`h-16 overflow-hidden rounded border ${
                    candidate.id === image.id
                      ? "border-accent ring-2 ring-accent/30"
                      : "border-rule hover:border-ink/30"
                  }`}
                >
                  <img
                    src={candidate.url}
                    alt={candidate.alt ?? ""}
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${candidate.focalX ?? 50}% ${
                        candidate.focalY ?? 50
                      }%`,
                    }}
                  />
                </button>
              ))}
            </div>
          )}
          <label className="block">
            <span className="block text-2xs text-ink-muted mb-0.5">
              Upload replacement
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingAsset}
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length === 0) return;
                setUploadingAsset(true);
                setUploadError(null);
                try {
                  const result = await api.upload(files, run?.clientId ?? undefined);
                  const uploaded = (result.files ?? [])
                    .filter((f) => f.kind === "image" && f.url)
                    .map(
                      (f): NewsImage => ({
                        id: f.id,
                        url: f.url ?? "",
                        alt: f.originalName,
                        caption: f.originalName,
                        aspect: "landscape",
                        focalX: 50,
                        focalY: 50,
                        zoom: 1,
                        isPlaceholder: false,
                        source: "UPLOAD",
                      }),
                    );
                  if (uploaded.length === 0) {
                    setUploadError("No usable image returned.");
                    return;
                  }
                  onImagesChange([...images, ...uploaded]);
                  updateBlock({ imageId: uploaded[0].id });
                } catch (err) {
                  setUploadError(
                    err instanceof ApiError ? err.message : "Upload failed.",
                  );
                } finally {
                  setUploadingAsset(false);
                }
              }}
              className="block w-full text-xs text-ink-muted file:mr-2 file:h-8 file:rounded file:border-0 file:bg-accent-soft file:px-2 file:text-accent"
            />
          </label>
          {uploadError && <div className="text-xs text-error">{uploadError}</div>}
          <TextField
            label="Image URL"
            value={image.url}
            onChange={(url) => updateImage({ url })}
          />
          <TextField
            label="Caption"
            value={image.caption ?? ""}
            onChange={(caption) => updateImage({ caption: caption || undefined })}
          />
          <TextField
            label="Alt text"
            value={image.alt ?? ""}
            onChange={(alt) => updateImage({ alt: alt || undefined })}
          />
          <label className="block">
            <span className="block text-2xs text-ink-muted mb-0.5">Aspect</span>
            <select
              value={image.aspect ?? "landscape"}
              onChange={(e) =>
                updateImage({ aspect: e.target.value as NewsImage["aspect"] })
              }
              className="w-full h-8 px-2 bg-surface border border-rule rounded text-sm"
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
              <option value="square">Square</option>
            </select>
          </label>
          <RangeField
            label="Crop X"
            value={image.focalX ?? 50}
            min={0}
            max={100}
            onChange={(focalX) => updateImage({ focalX })}
          />
          <RangeField
            label="Crop Y"
            value={image.focalY ?? 50}
            min={0}
            max={100}
            onChange={(focalY) => updateImage({ focalY })}
          />
          <RangeField
            label="Zoom"
            value={image.zoom ?? 1}
            min={1}
            max={3}
            step={0.05}
            onChange={(zoom) => updateImage({ zoom })}
          />
        </div>
      )}

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

        {block.kind === "image" && (
          <div className="border border-rule rounded-md p-2 space-y-2">
            <TextField
              label="Replace with URL"
              value={assetUrl}
              onChange={setAssetUrl}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!assetUrl.trim()}
              onClick={() => {
                if (!layout || !assetUrl.trim()) return;
                const next = makeImage(assetUrl.trim());
                onImagesChange([...images, next]);
                updateBlock({ imageId: next.id });
                setAssetUrl("");
              }}
            >
              Use this image
            </Button>
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
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full h-8 px-2 bg-surface border border-rule rounded text-sm"
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-2xs text-ink-muted">
        <span>{label}</span>
        <span>{Number.isInteger(step) ? value : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[rgb(var(--accent))]"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 px-2 bg-surface border border-rule rounded text-sm"
      />
    </label>
  );
}

function cloneLayout(layout: AssembledLayout | null): AssembledLayout | null {
  return layout ? JSON.parse(JSON.stringify(layout)) : null;
}

function cloneList<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items));
}

function isDocumentDirty(
  layout: AssembledLayout,
  articles: Article[],
  images: NewsImage[],
  pendingLayout: AssembledLayout,
  pendingArticles: Article[],
  pendingImages: NewsImage[],
): boolean {
  return (
    JSON.stringify(layout.blocks) !== JSON.stringify(pendingLayout.blocks) ||
    JSON.stringify(articles) !== JSON.stringify(pendingArticles) ||
    JSON.stringify(images) !== JSON.stringify(pendingImages)
  );
}

function makeArticle(): Article {
  const body =
    "Add the newsletter copy here. This section can be moved, resized, styled, and exported with the finished PDF.";
  return {
    id: `article-${Date.now()}`,
    title: "New Section",
    body,
    wordCount: countWords(body),
    isFiller: false,
    source: "GENERATED",
    articleType: "announcement",
  };
}

function makeImage(url?: string): NewsImage {
  return {
    id: `image-${Date.now()}`,
    url:
      url ??
      "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=80",
    caption: "New image",
    alt: "Newsletter image",
    aspect: "landscape",
    focalX: 50,
    focalY: 50,
    zoom: 1,
    isPlaceholder: false,
    source: url ? "UPLOAD" : "GENERATED",
  };
}

function makeBlock(
  kind: LayoutBlock["kind"],
  page: number,
  patch: Partial<LayoutBlock>,
): LayoutBlock {
  return {
    blockId: `block-${Date.now()}`,
    slotId: `custom-${Date.now()}`,
    page,
    position: { col: 1, row: 14, colSpan: kind === "image" ? 5 : 7, rowSpan: 4 },
    kind,
    needsFiller: false,
    zIndex: 0,
    ...patch,
  };
}

interface SectionTemplate {
  id: string;
  label: string;
  help: string;
  styleTag: string;
  title: string;
  body: string;
  position: LayoutBlock["position"];
  withImage?: boolean;
}

const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "director-note",
    label: "Director Note",
    help: "Letter-style feature",
    styleTag: "feature",
    title: "A Note From the Director",
    body:
      "This month, our community is making room for the simple moments that bring people together: familiar songs, favorite meals, visiting families, and neighbors saving one another a seat. Thank you for being part of the warmth that makes this campus feel like home.",
    position: { col: 1, row: 11, colSpan: 6, rowSpan: 5 },
  },
  {
    id: "event-schedule",
    label: "Event Schedule",
    help: "Dated activity list",
    styleTag: "banner",
    title: "Upcoming Events",
    body:
      "7/3 Red, White & Blue Happy Hour\n7/10 Patio Social\n7/17 Ice Cream Afternoon\n7/24 Family Brunch\n7/31 Summer Sendoff",
    position: { col: 7, row: 11, colSpan: 6, rowSpan: 4 },
  },
  {
    id: "birthday-list",
    label: "Birthdays",
    help: "Resident/staff list",
    styleTag: "spotlight",
    title: "Happy Birthday!",
    body:
      "Residents\nMary Ann F. 7/3\nShirley S. 7/10\nJanice F. 7/22\n\nStaff\nErica M. 7/1\nGrace C. 7/8\nMorgan C. 7/20",
    position: { col: 1, row: 16, colSpan: 4, rowSpan: 5 },
  },
  {
    id: "photo-story",
    label: "Photo Story",
    help: "Image + caption copy",
    styleTag: "photo",
    title: "Out and About",
    body:
      "Residents enjoyed a sunny afternoon outing filled with conversation, laughter, and a few favorite stops along the way.",
    position: { col: 5, row: 16, colSpan: 8, rowSpan: 5 },
    withImage: true,
  },
  {
    id: "callout",
    label: "Callout",
    help: "Short announcement",
    styleTag: "pull-quote",
    title: "Family Reminder",
    body:
      "Families are invited to check the community calendar for upcoming gatherings, RSVP dates, and opportunities to join residents for special summer events.",
    position: { col: 1, row: 21, colSpan: 12, rowSpan: 3 },
  },
];

function insertSectionTemplate(
  template: SectionTemplate,
  layout: AssembledLayout,
  articles: Article[],
  images: NewsImage[],
  page: number,
): {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  selectedBlockId: string;
} {
  const article: Article = {
    id: `article-${template.id}-${Date.now()}`,
    title: template.title,
    body: template.body,
    wordCount: countWords(template.body),
    isFiller: false,
    source: "GENERATED",
    articleType: template.id === "director-note" ? "executive-note" : "announcement",
  };
  const block = makeBlock("article", page, {
    articleId: article.id,
    styleTag: template.styleTag,
    position: template.position,
    slotId: `custom-${template.id}-${Date.now()}`,
  });
  const nextBlocks = [...layout.blocks, block];
  let nextImages = images;

  if (template.withImage) {
    const image = makeImage();
    const imageBlock = makeBlock("image", page, {
      imageId: image.id,
      styleTag: "photo",
      position: {
        col: template.position.col,
        row: Math.max(1, template.position.row - 5),
        colSpan: Math.min(5, template.position.colSpan),
        rowSpan: 4,
      },
      slotId: `custom-${template.id}-image-${Date.now()}`,
    });
    nextImages = [...images, image];
    nextBlocks.push(imageBlock);
  }

  return {
    layout: { ...layout, blocks: nextBlocks },
    articles: [...articles, article],
    images: nextImages,
    selectedBlockId: block.blockId,
  };
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
