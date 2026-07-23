import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type {
  Article,
  ClientFull,
  FillerMode,
  NewsImage,
  RunRecord,
  TemplateRecord,
} from "@/lib/types";
import { normalizeApprovalStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal, ModalHeader } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { useToast } from "@/lib/toast";
import { AutoArrangeBanner } from "@/components/AutoArrangeBanner";
import {
  CompliancePanel,
  ComplianceBellButton,
} from "@/components/CompliancePanel";
import { ChangeTemplateModal } from "@/components/ChangeTemplateModal";
import { AiRearrangeModal } from "@/components/AiRearrangeModal";

type Tone = "warm" | "formal" | "playful" | "civic";

const AI_UNLOCK_KEY = "newsforge.aiUnlocked";

interface UploadItem {
  id: string;
  label: string;
  kind: "image" | "text" | "doc";
  meta: string;
  article?: Article;
  image?: NewsImage;
}

export default function Workspace() {
  const { clientId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [client, setClient] = useState<ClientFull | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filler, setFiller] = useState<FillerMode>("GENERATE");
  const [tab, setTab] = useState<"mock" | "upload">("mock");

  // Generate-mock controls
  const [month, setMonth] = useState("June 2026");
  const [tone, setTone] = useState<Tone>("warm");
  const [density, setDensity] = useState(2); // 1-4
  const [include, setInclude] = useState<Record<string, boolean>>({
    director: true,
    spotlight: true,
    events: true,
    menu: true,
    opEd: false,
  });

  const [generatedArticles, setGeneratedArticles] = useState<Article[]>([]);
  const [generatedImages, setGeneratedImages] = useState<NewsImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Uploads
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Assembling
  const [assembling, setAssembling] = useState(false);
  const [assembleStage, setAssembleStage] =
    useState<"working" | "error" | "done">("working");
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [cancelToken, setCancelToken] = useState(0);
  const [assembleUnlockOpen, setAssembleUnlockOpen] = useState(false);

  // v2 additions ---------------------------------------------------------
  const runIdFromQuery = search.get("runId") ?? "";
  const [run, setRun] = useState<RunRecord | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [complianceOpen, setComplianceOpen] = useState<boolean>(
    () => search.get("compliance") === "open",
  );
  const [changeTemplateOpen, setChangeTemplateOpen] = useState(false);
  const [aiRearrangeOpen, setAiRearrangeOpen] = useState(false);
  const [aiRearranging, setAiRearranging] = useState(false);
  const [aiFellBack, setAiFellBack] = useState(false);
  const [rearranging, setRearranging] = useState(false);

  // Load client
  useEffect(() => {
    let cancelled = false;
    setClient(null);
    setLoadError(null);
    api
      .getClient(clientId)
      .then((c) => {
        if (!cancelled) setClient(c);
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : "Couldn't load client";
        if (!cancelled) {
          setLoadError(msg);
          toast(msg, { tone: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, toast]);

  // Load current run (if a ?runId= is present so banner + compliance work)
  useEffect(() => {
    if (!runIdFromQuery) {
      setRun(null);
      return;
    }
    let cancelled = false;
    api
      .getRun(runIdFromQuery)
      .then((r) => {
        if (!cancelled) setRun(r);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : "Couldn't load run";
        toast(msg, { tone: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [runIdFromQuery, toast]);

  // Load templates for the change-template modal.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const all: TemplateRecord[] = data?.templates ?? [];
        // Trilogy is client #26 and gets exactly its 5 templates. Others get
        // the templates matching their richness — but since Screen 5 is Trilogy-
        // scoped, show only Trilogy-tagged templates when the client is Trilogy;
        // otherwise show the richness-matching templates as a graceful fallback.
        const filtered = all.filter((t) => {
          const notes =
            (t.compatibilityHints as { notes?: string } | null)?.notes ?? "";
          const isTrilogyTemplate =
            notes.includes("[trilogy]") || t.name.startsWith("Trilogy ");
          if (client?.name === "Trilogy Health Services") {
            return isTrilogyTemplate;
          }
          if (isTrilogyTemplate) return false;
          const hints = t.compatibilityHints?.richness ?? [];
          return client ? hints.includes(client.richnessLevel) : true;
        });
        setTemplates(filtered);
      })
      .catch(() => {
        // Non-fatal: modal will show empty state.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const totalArticles = generatedArticles.length + uploads.filter((u) => u.article).length;
  const totalImages = generatedImages.length + uploads.filter((u) => u.image).length;
  const hasContent = totalArticles + totalImages > 0;

  const submittedArticleCount = useMemo(() => {
    if (run?.articles) return run.articles.length;
    return totalArticles;
  }, [run, totalArticles]);

  const handleGenerateMock = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const includeList = Object.entries(include)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const result = await api.generateMockContent(clientId, {
        month,
        tone,
        density,
        include: includeList,
      });
      setGeneratedArticles(result.articles ?? []);
      setGeneratedImages(result.images ?? []);
      toast(
        `Generated ${result.articles?.length ?? 0} articles · ${result.images?.length ?? 0} images`,
        { tone: "success" },
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Mock generation hiccuped.";
      setGenerateError("Mock generation hiccuped. Try again.");
      toast(msg, { tone: "error" });
    } finally {
      setGenerating(false);
    }
  };

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setUploading(true);
      try {
        const result = await api.upload(files, clientId);
        const items: UploadItem[] = (result.files ?? []).map((f, i) => {
          if (f.kind === "image") {
            const img: NewsImage = {
              id: f.id,
              url: f.url ?? "",
              alt: f.originalName,
              aspect: "landscape",
              source: "UPLOAD",
            };
            return {
              id: f.id,
              label: f.originalName ?? `image-${i}`,
              kind: "image",
              meta: humanBytes(f.bytes ?? 0),
              image: img,
            };
          }
          const article: Article = {
            id: f.id,
            title: f.title ?? f.originalName ?? "Uploaded text",
            body: f.body ?? "",
            wordCount: countWords(f.body ?? ""),
            source: "UPLOAD",
          };
          return {
            id: f.id,
            label: f.originalName ?? f.title ?? `doc-${i}`,
            kind: (f.originalName ?? "").toLowerCase().endsWith(".docx")
              ? "doc"
              : "text",
            meta: humanBytes(f.bytes ?? (f.body?.length ?? 0)),
            article,
          };
        });
        setUploads((cur) => [...cur, ...items]);
        toast(`Uploaded ${items.length} item${items.length === 1 ? "" : "s"}`, {
          tone: "success",
        });
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Upload failed.";
        toast(msg, { tone: "error" });
      } finally {
        setUploading(false);
      }
    },
    [clientId, toast],
  );

  const handlePasteAdd = () => {
    const text = pasteText.trim();
    if (text.length < 1) return;
    const id = `paste-${Date.now()}`;
    const article: Article = {
      id,
      title: "Pasted text",
      body: text,
      wordCount: countWords(text),
      source: "UPLOAD",
    };
    setUploads((cur) => [
      ...cur,
      {
        id,
        label: "Pasted text",
        kind: "text",
        meta: `${text.length} chars`,
        article,
      },
    ]);
    setPasteText("");
    toast("Added pasted text", { tone: "success" });
  };

  const removeUpload = (id: string) => {
    const item = uploads.find((u) => u.id === id);
    setUploads((cur) => cur.filter((u) => u.id !== id));
    if (item) {
      toast(`Removed ${item.label}`, {
        action: {
          label: "Undo",
          onClick: () => setUploads((cur) => [...cur, item]),
        },
      });
    }
  };

  const assemble = async (password?: string) => {
    if (!client) return;
    setAssembling(true);
    setAssembleStage("working");
    setAssembleError(null);
    const token = cancelToken;
    const start = Date.now();

    const articles: Article[] = [
      ...generatedArticles,
      ...uploads.map((u) => u.article).filter((a): a is Article => !!a),
    ];
    const images: NewsImage[] = [
      ...generatedImages,
      ...uploads.map((u) => u.image).filter((i): i is NewsImage => !!i),
    ];

    try {
      const newRun = await api.createRun({
        clientId: client.id,
        templateId: client.defaultTemplate?.id ?? undefined,
        monthLabel: month,
        fillerMode: filler,
        ...(password ? { password } : {}),
        articles,
        images,
      });
      // Honour minimum overlay duration of 2.5s
      const elapsed = Date.now() - start;
      if (elapsed < 2500) {
        await new Promise((r) => setTimeout(r, 2500 - elapsed));
      }
      if (token !== cancelToken) return; // cancelled
      setAssembleStage("done");
      await new Promise((r) => setTimeout(r, 400));
      navigate(`/workspace/${client.id}/preview?runId=${newRun.id}`);
    } catch (err) {
      if (token !== cancelToken) return;
      if (
        filler === "GENERATE" &&
        err instanceof ApiError &&
        err.status === 401 &&
        err.message === "ai_locked"
      ) {
        setAssembling(false);
        setAssembleUnlockOpen(true);
        return;
      }
      const msg = err instanceof ApiError ? err.message : "Assembly failed.";
      setAssembleError(msg);
      setAssembleStage("error");
    }
  };

  const handleAssembleClick = () => {
    if (filler === "GENERATE") {
      setAssembleUnlockOpen(true);
      return;
    }
    void assemble();
  };

  const cancelAssemble = () => {
    setCancelToken((c) => c + 1);
    setAssembling(false);
    toast("Assembly cancelled.");
  };

  // v2: manual template swap. Re-POSTs the run with an explicit templateId,
  // per Sofia Screen 5 handoff. Backend does not re-score when templateId
  // is supplied (see routes/runs.ts:152).
  const applyManualTemplate = async (templateId: string) => {
    if (!client) throw new Error("No client");
    setRearranging(true);
    try {
      const articles: Article[] = run?.articles ?? [
        ...generatedArticles,
        ...uploads.map((u) => u.article).filter((a): a is Article => !!a),
      ];
      const images: NewsImage[] = run?.images ?? [
        ...generatedImages,
        ...uploads.map((u) => u.image).filter((i): i is NewsImage => !!i),
      ];
      const newRun = await api.createRun({
        clientId: client.id,
        templateId,
        monthLabel: run?.monthLabel ?? month,
        fillerMode: filler,
        articles,
        images,
      });
      setRun(newRun);
      setSearch(
        (cur) => {
          cur.set("runId", newRun.id);
          return cur;
        },
        { replace: true },
      );
      toast("Template swapped. Content re-arranged.", { tone: "success" });
      setChangeTemplateOpen(false);
    } finally {
      setRearranging(false);
    }
  };

  const handleAiRearrangeApplied = (result: {
    run: RunRecord;
    chosenBy: "ai" | "deterministic-fallback";
    chosenTemplateId: string;
    reason: string;
  }) => {
    setRun(result.run);
    setAiFellBack(result.chosenBy === "deterministic-fallback");
    const chosenName =
      templates.find((t) => t.id === result.chosenTemplateId)?.name ?? "template";
    if (result.chosenBy === "ai") {
      toast(
        `Gemini picked ${chosenName}${
          result.reason ? ` — ${result.reason.slice(0, 120)}` : ""
        }`,
        { tone: "success" },
      );
    } else {
      toast(
        `Gemini failed — used deterministic pick (${chosenName}).`,
        { tone: "warn" },
      );
    }
  };

  // -- header / loading guards
  if (loadError) {
    return (
      <div className="px-10 py-20 max-w-3xl mx-auto text-center">
        <div className="text-warn text-lg mb-2">⚠ Couldn't load client</div>
        <p className="text-sm text-ink-muted mb-6">{loadError}</p>
        <Link to="/" className="text-accent hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  const approvalStatus = normalizeApprovalStatus(run?.approvalStatus);
  const currentTemplateId = run?.layoutFitReport?.chosenTemplateId ?? run?.templateId ?? null;

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="border-b border-rule bg-surface sticky top-16 z-20">
        <div className="px-10 h-[72px] flex items-center gap-6 max-w-[1320px] mx-auto">
          <Link
            to="/"
            className="text-sm text-ink-muted hover:text-ink flex items-center gap-1"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            {client ? (
              <>
                <span
                  className="h-3 w-3 rounded-full flex-none"
                  style={{ background: client.primaryColor }}
                  aria-hidden
                />
                <span className="font-display font-semibold truncate">
                  {client.name}
                </span>
              </>
            ) : (
              <Skeleton h="h-5" w="w-48" />
            )}
          </div>

          <div className="ml-auto flex items-center gap-4">
            {run && (
              <ComplianceBellButton
                runId={run.id}
                flags={run.complianceFlags}
                onClick={() => setComplianceOpen(true)}
              />
            )}
            <FillerToggle value={filler} onChange={setFiller} />
            <Button
              variant="primary"
              size="md"
              disabled={!hasContent || !client}
              title={
                !hasContent
                  ? "Add content or generate a mock first."
                  : undefined
              }
              onClick={handleAssembleClick}
            >
              Assemble Newsletter →
            </Button>
          </div>
        </div>
      </div>

      {/* v2 Screen 2 — auto-arrange banner (only when a run is loaded) */}
      {run && (
        <AutoArrangeBanner
          runId={run.id}
          report={run.layoutFitReport}
          templates={templates}
          approvalStatus={approvalStatus}
          submittedArticleCount={submittedArticleCount}
          aiRearranging={aiRearranging || rearranging}
          aiFellBack={aiFellBack}
          onChangeTemplate={() => setChangeTemplateOpen(true)}
          onAiRearrange={() => {
            setAiFellBack(false);
            setAiRearrangeOpen(true);
          }}
        />
      )}

      {/* Body */}
      <div className="px-10 py-8 max-w-[1320px] mx-auto w-full grid gap-6 grid-cols-1 lg:grid-cols-[3fr_2fr]">
        {/* LEFT: content panel */}
        <section className="bg-surface border border-rule rounded-xl overflow-hidden">
          <div className="px-5 pt-4">
            <h2 className="font-display font-semibold text-base mb-3">Content</h2>
            <Tabs
              value={tab}
              onChange={(k) => setTab(k as "mock" | "upload")}
              tabs={[
                { key: "mock", label: "Generate Mock", count: generatedArticles.length },
                { key: "upload", label: "Upload", count: uploads.length },
              ]}
            />
          </div>
          <div className="p-5">
            {tab === "mock" ? (
              <MockTab
                month={month}
                setMonth={setMonth}
                tone={tone}
                setTone={setTone}
                density={density}
                setDensity={setDensity}
                include={include}
                setInclude={setInclude}
                generating={generating}
                onGenerate={handleGenerateMock}
                generated={generatedArticles}
                images={generatedImages}
                onClear={() => {
                  setGeneratedArticles([]);
                  setGeneratedImages([]);
                }}
                error={generateError}
              />
            ) : (
              <UploadTab
                uploads={uploads}
                onFiles={handleFiles}
                uploading={uploading}
                pasteText={pasteText}
                setPasteText={setPasteText}
                onPasteAdd={handlePasteAdd}
                onRemove={removeUpload}
              />
            )}
          </div>
        </section>

        {/* RIGHT: brand kit */}
        <BrandKitPanel client={client} />
      </div>

      <ProcessingOverlay
        open={assembling}
        stage={assembleStage}
        errorBody={assembleError ?? undefined}
        onCancel={cancelAssemble}
        onTryAgain={() => void assemble()}
        onBack={() => setAssembling(false)}
      />
      <AssembleUnlockModal
        open={assembleUnlockOpen}
        onClose={() => setAssembleUnlockOpen(false)}
        onUnlocked={(password) => {
          setAssembleUnlockOpen(false);
          void assemble(password);
        }}
      />

      {/* v2 Screen 3 — compliance drawer */}
      {run && (
        <CompliancePanel
          open={complianceOpen}
          onClose={() => {
            setComplianceOpen(false);
            // Clear the deep-link param
            setSearch(
              (cur) => {
                cur.delete("compliance");
                return cur;
              },
              { replace: true },
            );
          }}
          runId={run.id}
          flags={run.complianceFlags}
          articles={run.articles ?? []}
          images={run.images ?? []}
          approvalStatus={approvalStatus}
        />
      )}

      {/* v2 Screen 5 — change template */}
      {run && (
        <ChangeTemplateModal
          open={changeTemplateOpen}
          onClose={() => setChangeTemplateOpen(false)}
          templates={templates}
          currentTemplateId={currentTemplateId}
          disabled={approvalStatus === "approved"}
          disabledReason={
            approvalStatus === "approved"
              ? "Run is approved. Request changes on the Preview page to modify the layout."
              : undefined
          }
          onApply={applyManualTemplate}
        />
      )}

      {/* v2 Screen 6 — AI re-arrange */}
      {run && (
        <AiRearrangeModal
          open={aiRearrangeOpen}
          runId={run.id}
          currentTemplateId={currentTemplateId}
          templates={templates}
          onClose={() => setAiRearrangeOpen(false)}
          onApplied={(result) => {
            setAiRearranging(false);
            handleAiRearrangeApplied(result);
          }}
        />
      )}
    </div>
  );
}

function AssembleUnlockModal({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      setUnlocking(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setUnlocking(true);
    setError(null);
    try {
      await api.unlock(password);
      sessionStorage.setItem(AI_UNLOCK_KEY, "1");
      onUnlocked(password);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "That's not it. Try again."
          : err instanceof ApiError
            ? err.message
            : "Couldn't unlock.";
      setError(msg);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="w-[480px]"
      labelledBy="assemble-unlock-title"
    >
      <ModalHeader
        title={<span id="assemble-unlock-title">AI filler access</span>}
        subtitle="Generate AI filler uses the shared demo password."
        onClose={onClose}
      />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Enter demo password
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={`w-full h-10 px-3 bg-surface border rounded-md text-sm focus:outline-none ${
              error ? "border-error" : "border-rule focus:border-accent"
            }`}
          />
          {error && <div className="mt-1.5 text-2xs text-error">{error}</div>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!password}
            loading={unlocking}
          >
            Unlock and assemble →
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------- TOP BAR -------- */

function FillerToggle({
  value,
  onChange,
}: {
  value: FillerMode;
  onChange: (v: FillerMode) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-sm"
      title="Controls how empty sections are filled when assembling."
    >
      <span className="text-ink-muted">Filler:</span>
      <div className="inline-flex bg-rule/40 rounded-md p-0.5">
        {(
          [
            ["GENERATE", "Generate AI filler"],
            ["PLACEHOLDER", "Use placeholders"],
          ] as const
        ).map(([k, label]) => {
          const active = value === k;
          return (
            <button
              key={k}
              onClick={() => onChange(k)}
              className={`px-3 h-8 rounded text-sm transition-colors ${
                active
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------- MOCK TAB -------- */

function MockTab({
  month,
  setMonth,
  tone,
  setTone,
  density,
  setDensity,
  include,
  setInclude,
  generating,
  onGenerate,
  generated,
  images,
  onClear,
  error,
}: {
  month: string;
  setMonth: (s: string) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  density: number;
  setDensity: (n: number) => void;
  include: Record<string, boolean>;
  setInclude: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  generating: boolean;
  onGenerate: () => void;
  generated: Article[];
  images: NewsImage[];
  onClear: () => void;
  error: string | null;
}) {
  const densityLabel = ["Simple", "Moderate", "Rich", "Extra-Rich"][density - 1];
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        Generate a month of mock content for this community. Adjust knobs, click
        Generate.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Month">
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 px-3 w-full bg-surface border border-rule rounded-md text-sm"
          />
        </Field>
        <Field label="Tone">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="h-10 px-3 w-full bg-surface border border-rule rounded-md text-sm"
          >
            <option value="warm">Warm &amp; Familial</option>
            <option value="formal">Formal</option>
            <option value="playful">Playful</option>
            <option value="civic">Civic</option>
          </select>
        </Field>
        <Field label={`Density · ${densityLabel}`} className="md:col-span-2">
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={density}
            onChange={(e) => setDensity(Number(e.target.value))}
            className="w-full accent-[rgb(var(--accent))]"
          />
        </Field>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium mb-1">Include</legend>
        {(
          [
            ["director", "Director's Letter"],
            ["spotlight", "Resident Spotlight"],
            ["events", "Events"],
            ["menu", "Menu"],
            ["opEd", "Op-ed / community voice"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={include[key]}
              onChange={(e) =>
                setInclude((cur) => ({ ...cur, [key]: e.target.checked }))
              }
              className="accent-[rgb(var(--accent))]"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {error && (
        <div className="bg-error/5 border border-error/20 text-error text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <Button variant="primary" loading={generating} onClick={onGenerate}>
        Generate mock content
      </Button>

      {(generated.length > 0 || images.length > 0) && (
        <div className="pt-4 border-t border-rule">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Generated items</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onGenerate}>
                Regenerate all
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {generated.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 text-sm text-ink-muted"
              >
                • <span className="text-ink truncate flex-1">{a.title}</span>{" "}
                <span>({a.wordCount} words)</span>
              </li>
            ))}
            {images.length > 0 && (
              <li className="flex items-center gap-2 text-sm text-ink-muted">
                • <span className="text-ink">Images</span>{" "}
                <span>({images.length} placeholders)</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------- UPLOAD TAB -------- */

function UploadTab({
  uploads,
  onFiles,
  uploading,
  pasteText,
  setPasteText,
  onPasteAdd,
  onRemove,
}: {
  uploads: UploadItem[];
  onFiles: (f: FileList | File[]) => void;
  uploading: boolean;
  pasteText: string;
  setPasteText: (s: string) => void;
  onPasteAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="space-y-5">
      {/* v2 Screen 4 — submission template download */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <a
          href={api.submissionTemplateUrl()}
          download
          className="inline-flex items-center gap-1.5 text-accent font-medium hover:underline"
        >
          ⬇ Download submission template (.docx)
        </a>
        <button
          type="button"
          className="text-2xs text-ink-muted hover:text-ink underline"
          onClick={() => setHelpOpen((v) => !v)}
        >
          What is this?
        </button>
        {helpOpen && (
          <div className="basis-full mt-1 text-2xs text-ink-muted bg-accent-soft rounded-md px-3 py-2">
            A generic Word doc with instructions and 10 numbered [Article Name] /
            [Article Body] sections. Send it to a building, they fill in what
            they've got, upload it back here.
          </div>
        )}
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        className={`relative block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-rule hover:border-ink/30 bg-bg/50"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.txt,.docx"
          className="sr-only"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
        />
        <div className="text-2xl mb-2" aria-hidden>
          ⬆
        </div>
        <div className="text-sm font-medium">
          {uploading ? "Uploading…" : "Drop files or click to browse"}
        </div>
        <div className="text-2xs text-ink-muted mt-1">
          Images (.jpg, .png, .webp), .docx, .txt — or paste text below.
        </div>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1.5">Paste text</label>
        <textarea
          rows={6}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste content from email, Word, or anywhere…"
          className="w-full font-mono text-sm p-3 bg-surface border border-rule rounded-md focus:border-accent focus:outline-none resize-y"
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={pasteText.trim().length === 0}
            onClick={onPasteAdd}
          >
            Add as text block
          </Button>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="pt-4 border-t border-rule">
          <h3 className="text-sm font-semibold mb-2">Uploaded items</h3>
          <ul className="border border-rule rounded-lg overflow-hidden">
            {uploads.map((u) => (
              <li
                key={u.id}
                className="h-12 px-3 flex items-center gap-3 text-sm border-b border-rule last:border-b-0 hover:bg-bg group"
              >
                <span className="text-base" aria-hidden>
                  {u.kind === "image" ? "🖼" : u.kind === "doc" ? "📄" : "📝"}
                </span>
                <span className="truncate flex-1">{u.label}</span>
                <span className="text-2xs text-ink-muted">{u.meta}</span>
                <button
                  aria-label={`Remove ${u.label}`}
                  onClick={() => onRemove(u.id)}
                  className="text-ink-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity px-1"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="text-2xs text-ink-muted mt-2">
            Total: {uploads.length} item{uploads.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- BRAND KIT -------- */

function BrandKitPanel({ client }: { client: ClientFull | null }) {
  if (!client) {
    return (
      <aside className="bg-surface border border-rule rounded-xl p-5 space-y-4">
        <Skeleton h="h-32" w="w-32" rounded="rounded-md" />
        <Skeleton h="h-4" w="w-3/4" />
        <Skeleton h="h-4" w="w-2/3" />
        <Skeleton h="h-4" w="w-1/2" />
      </aside>
    );
  }
  return (
    <aside className="bg-surface border border-rule rounded-xl p-5 space-y-6">
      <h2 className="font-display font-semibold text-base">Brand Kit</h2>

      {/* Logo */}
      <div className="flex items-center justify-center">
        <div
          className="h-[120px] w-[120px] border border-rule rounded-md grid place-items-center"
          style={{ background: tint(client.primaryColor, 92) }}
        >
          {client.logoUrl ? (
            <img
              src={client.logoUrl}
              alt={`${client.name} logo`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div
              className="h-16 w-16 rounded-md grid place-items-center text-white font-display font-bold text-2xl"
              style={{ background: client.primaryColor }}
            >
              {client.name.charAt(0)}
            </div>
          )}
        </div>
      </div>

      {/* Colors */}
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
          Colors
        </div>
        <ul className="space-y-2">
          {[
            ["Primary", client.primaryColor],
            ["Secondary", client.secondaryColor],
            ["Accent", client.accentColor],
          ].map(([label, hex]) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className="h-6 w-6 rounded border border-black/5"
                style={{ background: hex }}
              />
              <span className="flex-1">{label}</span>
              <span className="font-mono text-2xs text-ink-muted uppercase">
                {hex}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Type */}
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
          Type
        </div>
        <div
          className="text-lg leading-tight"
          style={{ fontFamily: `${client.headingFont}, serif` }}
        >
          Headings: {client.headingFont}
        </div>
        <div
          className="text-sm mt-1"
          style={{ fontFamily: `${client.bodyFont}, sans-serif` }}
        >
          Body: {client.bodyFont}
        </div>
      </div>

      {/* Template */}
      {client.defaultTemplate && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
            Template
          </div>
          <div className="text-sm font-medium">
            "{client.defaultTemplate.name}"
          </div>
          <div className="text-xs text-ink-muted">
            {client.defaultTemplate.pageCount} pages
          </div>
        </div>
      )}

      {/* Recurring sections */}
      {client.recurringSections.length > 0 && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
            Recurring sections
          </div>
          <ul className="space-y-1 text-sm">
            {client.recurringSections.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span className="text-ink-muted">·</span> {s.title}
                {s.required && (
                  <Tag tone="blue" className="ml-auto">
                    required
                  </Tag>
                )}
              </li>
            ))}
            {client.recurringSections.length > 8 && (
              <li className="text-xs text-ink-muted">
                +{client.recurringSections.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}
    </aside>
  );
}

/* -------- Helpers -------- */

function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
function humanBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function tint(hex: string, pct: number): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const t = pct / 100;
  r = Math.round(r + (255 - r) * t);
  g = Math.round(g + (255 - g) * t);
  b = Math.round(b + (255 - b) * t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
