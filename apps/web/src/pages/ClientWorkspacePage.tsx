import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ClientFullDto,
  Article,
  ImageRef,
  FillerMode,
  NewsletterRunDto,
} from "@newsforge/shared";
import {
  getClient,
  createRun,
  getRun,
  generateMockContent,
  uploadFiles,
} from "../api/endpoints";
import { ApiError } from "../api/client";
import { applyClientFonts } from "../lib/fonts";
import { applyBrandColors, resetBrandColors } from "../lib/brand";
import { ClientLogo } from "../components/ClientLogo";
import { ColorSwatches } from "../components/ColorSwatches";
import { RichnessBadge } from "../components/RichnessBadge";
import { ProcessingOverlay } from "../components/ProcessingOverlay";
import { ErrorState, LoadingSkeleton } from "../components/states";
import { cn } from "../lib/cn";

interface ContentItem {
  kind: "article" | "image";
  id: string;
  title: string;
  meta?: string;
  source: "mock" | "upload" | "generated";
}

export function ClientWorkspacePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientFullDto | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [contentByKind, setContentByKind] = useState<{
    articles: Article[];
    images: ImageRef[];
  }>({ articles: [], images: [] });
  const [tab, setTab] = useState<"mock" | "upload">("mock");
  const [fillerMode, setFillerMode] = useState<FillerMode>("GENERATE");
  const [busy, setBusy] = useState(false);
  const [assembleErr, setAssembleErr] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Load client and apply brand to the document root.
  useEffect(() => {
    if (!clientId) return;
    const ctrl = new AbortController();
    setClient(null);
    setClientError(null);
    getClient(clientId, ctrl.signal)
      .then((res) => {
        setClient(res.client);
        applyBrandColors({
          primary: res.client.primaryColor,
          secondary: res.client.secondaryColor,
          accent: res.client.accentColor,
        });
        applyClientFonts(res.client.headingFont, res.client.bodyFont);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setClientError(
          e instanceof ApiError && e.status === 404
            ? "We couldn't find that client."
            : "Couldn't load this client. Try again in a moment.",
        );
      });
    return () => {
      ctrl.abort();
      resetBrandColors();
    };
  }, [clientId]);

  function pushItems(articles: Article[], images: ImageRef[]) {
    setContentByKind((prev) => ({
      articles: dedupeById([...prev.articles, ...articles]),
      images: dedupeById([...prev.images, ...images]),
    }));
    setItems((prev) => {
      const next = [
        ...prev,
        ...articles.map<ContentItem>((a) => ({
          kind: "article",
          id: a.id,
          title: a.title,
          meta: `${a.wordCount} words${a.section ? " · " + a.section : ""}`,
          source: "mock",
        })),
        ...images.map<ContentItem>((i) => ({
          kind: "image",
          id: i.id,
          title: i.alt || "Image",
          meta: `${i.width}×${i.height}`,
          source: i.source,
        })),
      ];
      // Dedupe by id+kind.
      const seen = new Set<string>();
      return next.filter((it) => {
        const k = it.kind + ":" + it.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
  }

  function removeItem(kind: ContentItem["kind"], id: string) {
    setItems((prev) => prev.filter((it) => !(it.kind === kind && it.id === id)));
    setContentByKind((prev) => ({
      articles:
        kind === "article" ? prev.articles.filter((a) => a.id !== id) : prev.articles,
      images: kind === "image" ? prev.images.filter((i) => i.id !== id) : prev.images,
    }));
  }

  const monthLabel = useMemo(() => defaultMonthLabel(), []);

  async function handleGenerateMock() {
    if (!client) return;
    setBusy(true);
    setAssembleErr(null);
    try {
      const res = await generateMockContent(client.id, { monthLabel, density: 2 });
      pushItems(res.articles, res.images);
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.body?.message ?? "Mock content failed."
          : "Mock content failed.";
      setAssembleErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssemble() {
    if (!client) return;
    setOverlayOpen(true);
    setAssembleErr(null);
    try {
      const created = await createRun({
        clientId: client.id,
        monthLabel,
        fillerMode,
        articleIds: contentByKind.articles.map((a) => a.id),
        imageIds: contentByKind.images.map((i) => i.id),
      });
      const ready = await pollRunUntilReady(created.run.id);
      if (ready.status === "ERROR") {
        setAssembleErr(ready.errorMessage ?? "Assembly failed.");
        return;
      }
      navigate(`/runs/${encodeURIComponent(ready.id)}`);
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.body?.message ?? "Assembly failed."
          : "Assembly failed.";
      setAssembleErr(msg);
    }
  }

  if (clientError) {
    return (
      <div className="px-8 py-10">
        <ErrorState
          title="Client unavailable"
          message={clientError}
          onRetry={() => navigate("/")}
        />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="px-8 py-10 max-w-7xl mx-auto w-full">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  const canAssemble = !overlayOpen && items.length > 0;

  return (
    <div className="flex flex-col flex-1">
      {/* TOP BAR */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <ClientLogo logoUrl={client.logoUrl} name={client.name} size={40} />
        <div className="flex-1 min-w-0">
          <h2
            className="font-semibold text-slate-900 text-lg leading-tight truncate"
            style={{ fontFamily: "var(--client-heading-font)" }}
          >
            {client.name}
          </h2>
          <p className="text-xs text-slate-500 truncate">
            {client.city} · {client.tagline}
          </p>
        </div>
        <FillerToggle value={fillerMode} onChange={setFillerMode} />
        <button
          className="btn-primary"
          onClick={handleAssemble}
          disabled={!canAssemble}
          title={items.length === 0 ? "Add content first" : "Assemble newsletter"}
        >
          ✨ Assemble Newsletter
        </button>
      </div>

      {/* THREE-ZONE LAYOUT */}
      <div className="flex-1 grid grid-cols-12 gap-6 px-6 py-6 max-w-[1500px] mx-auto w-full">
        {/* LEFT: content input */}
        <section className="col-span-7 card p-5 flex flex-col min-h-[480px]">
          <div className="flex items-center border-b border-slate-200 -mt-1">
            <TabBtn label="Generate Mock" active={tab === "mock"} onClick={() => setTab("mock")} />
            <TabBtn label="Upload" active={tab === "upload"} onClick={() => setTab("upload")} />
          </div>

          {tab === "mock" ? (
            <div className="py-4 space-y-3">
              <p className="text-sm text-slate-600">
                Generate a realistic batch of articles and images for{" "}
                <span className="font-medium">{monthLabel}</span> using this
                client's brand voice.
              </p>
              <button
                className="btn-secondary"
                onClick={handleGenerateMock}
                disabled={busy}
              >
                {busy ? "Generating…" : "✨ Generate mock content"}
              </button>
            </div>
          ) : (
            <UploadPanel
              clientId={client.id}
              onUploaded={(a, i) => pushItems(a, i)}
              onError={(m) => setAssembleErr(m)}
            />
          )}

          <ItemList items={items} onRemove={removeItem} />
          {assembleErr && (
            <div className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
              {assembleErr}
            </div>
          )}
        </section>

        {/* RIGHT: brand kit summary */}
        <aside className="col-span-5">
          <BrandKitPanel client={client} />
        </aside>
      </div>

      <ProcessingOverlay
        visible={overlayOpen}
        errorMessage={assembleErr && overlayOpen ? assembleErr : null}
        onErrorDismiss={() => {
          setOverlayOpen(false);
          setAssembleErr(null);
        }}
      />
    </div>
  );
}

function defaultMonthLabel(): string {
  const d = new Date();
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

async function pollRunUntilReady(runId: string): Promise<NewsletterRunDto> {
  const start = Date.now();
  const MAX_MS = 90_000;
  while (Date.now() - start < MAX_MS) {
    const res = await getRun(runId);
    if (res.run.status === "READY" || res.run.status === "ERROR") return res.run;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for the newsletter to assemble.");
}

/* ---------- subcomponents ---------- */

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
        active
          ? "border-brand-primary text-brand-primary"
          : "border-transparent text-slate-500 hover:text-slate-700",
      )}
    >
      {label}
    </button>
  );
}

function FillerToggle({
  value,
  onChange,
}: {
  value: FillerMode;
  onChange: (v: FillerMode) => void;
}) {
  return (
    <div className="inline-flex bg-slate-100 rounded-md p-0.5">
      <button
        onClick={() => onChange("GENERATE")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium rounded transition-colors",
          value === "GENERATE"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600",
        )}
      >
        ✨ Generate AI Filler
      </button>
      <button
        onClick={() => onChange("PLACEHOLDER")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium rounded transition-colors",
          value === "PLACEHOLDER"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600",
        )}
      >
        ▭ Use Placeholders
      </button>
    </div>
  );
}

function ItemList({
  items,
  onRemove,
}: {
  items: ContentItem[];
  onRemove: (kind: ContentItem["kind"], id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-4 flex-1 border-2 border-dashed border-slate-200 rounded-md flex items-center justify-center text-slate-400 text-sm py-12">
        No content yet. Generate mock content or upload files to get started.
      </div>
    );
  }
  return (
    <ul className="mt-4 flex-1 overflow-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
      {items.map((it) => (
        <li
          key={it.kind + ":" + it.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50"
        >
          <span className="text-lg" aria-hidden>
            {iconFor(it)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">
              {it.title}
            </div>
            <div className="text-xs text-slate-500">{it.meta}</div>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            {it.source}
          </span>
          <button
            onClick={() => onRemove(it.kind, it.id)}
            className="text-slate-400 hover:text-rose-600 px-2"
            aria-label={`Remove ${it.title}`}
            title="Remove"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function iconFor(it: ContentItem): string {
  if (it.kind === "image") return "🖼";
  return "📰";
}

function UploadPanel({
  clientId,
  onUploaded,
  onError,
}: {
  clientId: string;
  onUploaded: (articles: Article[], images: ImageRef[]) => void;
  onError: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((f) => isAcceptedFile(f));
    const rejected = Array.from(files).filter((f) => !isAcceptedFile(f));
    if (rejected.length) {
      onError(`Skipped ${rejected.length} unsupported file(s).`);
    }
    if (accepted.length === 0) return;
    setBusy(true);
    try {
      const res = await uploadFiles({ clientId, files: accepted });
      onUploaded(res.articles ?? [], res.images ?? []);
    } catch (e: unknown) {
      onError(
        e instanceof ApiError
          ? e.body?.message ?? "Upload failed."
          : "Upload failed.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="py-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "block border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors",
          isDragging
            ? "border-brand-primary bg-brand-primary/5"
            : "border-slate-300 hover:border-slate-400",
        )}
      >
        <div className="text-3xl">📤</div>
        <p className="mt-2 text-sm text-slate-700">
          Drop files here, or{" "}
          <span className="text-brand-primary font-medium">browse</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Images (.jpg/.png/.webp), text (.txt), or Word (.docx) — up to 12 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.txt,.docx,image/jpeg,image/png,image/webp,text/plain"
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={busy}
        />
      </label>
      {busy && (
        <p className="mt-2 text-xs text-slate-500">Uploading and processing…</p>
      )}
    </div>
  );
}

function isAcceptedFile(f: File): boolean {
  const okTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (okTypes.includes(f.type)) return true;
  return /\.(jpe?g|png|webp|txt|docx)$/i.test(f.name);
}

function BrandKitPanel({ client }: { client: ClientFullDto }) {
  return (
    <div className="card p-5 sticky top-20">
      <h3 className="text-xs uppercase tracking-widest text-slate-400">
        Brand Kit
      </h3>
      <div className="mt-3 flex items-start gap-4">
        <ClientLogo logoUrl={client.logoUrl} name={client.name} size={64} />
        <div className="min-w-0 flex-1">
          <div
            className="text-xl font-semibold text-slate-900"
            style={{ fontFamily: "var(--client-heading-font)" }}
          >
            {client.name}
          </div>
          <div className="text-sm text-slate-600 mt-0.5">{client.tagline}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RichnessBadge level={client.richnessLevel} />
            <span className="chip bg-slate-100 text-slate-700">
              {client.pageCount}-page newsletter
            </span>
          </div>
        </div>
      </div>

      <hr className="my-5 border-slate-100" />

      <Section title="Colors">
        <ColorSwatches
          primary={client.primaryColor}
          secondary={client.secondaryColor}
          accent={client.accentColor}
          size="md"
          showLabels
        />
      </Section>

      <Section title="Typography">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Heading</dt>
          <dd
            className="font-semibold text-slate-800"
            style={{ fontFamily: "var(--client-heading-font)" }}
          >
            {client.headingFont}
          </dd>
          <dt className="text-slate-500">Body</dt>
          <dd
            className="text-slate-800"
            style={{ fontFamily: "var(--client-body-font)" }}
          >
            {client.bodyFont}
          </dd>
        </dl>
      </Section>

      <Section title="Template">
        <p className="text-sm text-slate-700">{client.defaultTemplateId}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {client.pageCount} pages · {client.careLevel.replace(/_/g, " ").toLowerCase()}
        </p>
      </Section>

      <Section title="Recurring sections">
        {client.recurringSections.length === 0 ? (
          <p className="text-sm text-slate-500">No standing sections.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {client.recurringSections.map((s) => (
              <li
                key={s}
                className="chip bg-brand-primary/10 text-brand-primary"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Brand voice">
        <p className="text-sm italic text-slate-700">"{client.brandVoice}"</p>
      </Section>

      <Link
        to="/"
        className="block text-center mt-5 text-xs text-slate-500 hover:text-porter"
      >
        ← Choose a different client
      </Link>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="text-[11px] uppercase tracking-widest text-slate-400 mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}
