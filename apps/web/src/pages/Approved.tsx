/**
 * Approved — Sofia Screen 9. Route: `/approved`.
 *
 * Full-page list of every run with approvalStatus === 'approved'. Data
 * source: `api.listApprovedRuns()` → `GET /api/runs?status=approved`.
 * Bundle links transparently refresh signed URLs on click if expired.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type { RunRecord } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/lib/toast";

type SortKey = "newest" | "oldest" | "client";

export default function Approved() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  useEffect(() => {
    let cancelled = false;
    api
      .listApprovedRuns()
      .then((list) => {
        if (!cancelled) setRuns(list);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : "Couldn't load list";
        setLoadError(msg);
        toast(msg, { tone: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of runs ?? []) {
      const name = r.client?.name ?? r.clientId;
      seen.set(r.clientId, name);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [runs]);

  const filtered = useMemo(() => {
    const list = runs ?? [];
    const q = query.trim().toLowerCase();
    const filteredList = list.filter((r) => {
      if (clientFilter && r.clientId !== clientFilter) return false;
      if (!q) return true;
      const hay = `${r.client?.name ?? ""} ${r.monthLabel ?? ""} ${r.template?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    filteredList.sort((a, b) => {
      if (sortKey === "client") {
        return (a.client?.name ?? "").localeCompare(b.client?.name ?? "");
      }
      const at = a.approvedAt ? Date.parse(a.approvedAt) : 0;
      const bt = b.approvedAt ? Date.parse(b.approvedAt) : 0;
      return sortKey === "oldest" ? at - bt : bt - at;
    });
    return filteredList;
  }, [runs, query, clientFilter, sortKey]);

  return (
    <div className="px-10 py-8 max-w-[1120px] mx-auto">
      <header className="mb-6">
        <h1 className="font-display font-semibold text-2xl">Approved</h1>
        <p className="text-sm text-ink-muted mt-1">
          All approved newsletter runs. Grab artifacts here.
        </p>
      </header>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <input
            aria-label="Search approved runs"
            placeholder="🔍  Search client or month…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-10 px-3 bg-surface border border-rule rounded-md text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-10 px-3 bg-surface border border-rule rounded-md text-sm"
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {clientOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-10 px-3 bg-surface border border-rule rounded-md text-sm"
          aria-label="Sort"
        >
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
          <option value="client">Sort: client A–Z</option>
        </select>
      </div>

      {/* Body */}
      {loadError && (
        <div className="text-sm text-error bg-error/5 border border-error/20 rounded-md px-3 py-2 mb-4">
          {loadError}
        </div>
      )}

      {runs === null && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h="h-24" w="w-full" rounded="rounded-lg" />
          ))}
        </div>
      )}

      {runs !== null && runs.length === 0 && (
        <div className="border border-rule rounded-lg p-10 text-center bg-surface">
          <div className="text-3xl mb-2">📰</div>
          <div className="font-medium mb-1">Nothing approved yet</div>
          <p className="text-sm text-ink-muted mb-5">
            Assemble and approve a newsletter to see it here.
          </p>
          <Link
            to="/"
            className="inline-block px-4 h-10 leading-10 rounded-md bg-accent text-white font-medium"
          >
            Pick a client
          </Link>
        </div>
      )}

      {runs !== null && runs.length > 0 && filtered.length === 0 && (
        <div className="text-sm text-ink-muted py-6">
          No approved runs match “{query}”.
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <ApprovedRunCard key={r.id} run={r} />
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Link to="/" className="text-sm text-ink-muted hover:text-ink">
          ← Back to clients
        </Link>
      </div>
    </div>
  );
}

function ApprovedRunCard({ run }: { run: RunRecord }) {
  const { toast } = useToast();
  const [bundleUrl, setBundleUrl] = useState<string | null>(
    // Backend `run.bundleZipPath` is a filesystem path, not a signed URL.
    // We refresh signed URL on click; nothing to prime here yet.
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const approvedAt = run.approvedAt
    ? new Date(run.approvedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "";
  const approvedByLabel = run.approvedBy?.trim() || "(unspecified)";
  const previewHref = run.clientId
    ? `/workspace/${run.clientId}/preview?runId=${run.id}`
    : `/run/${run.id}/preview`;

  const webPdfHref = pdfPathToDownloadUrl(run.pdfPath);
  const printPdfHref = pdfPathToDownloadUrl(run.printPdfPath);

  const downloadBundle = async () => {
    if (bundleUrl) {
      window.open(bundleUrl, "_self");
      return;
    }
    setRefreshing(true);
    try {
      const result = await api.exportBundle(run.id);
      setBundleUrl(result.bundleUrl);
      window.open(result.bundleUrl, "_self");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Bundle build failed.";
      toast(msg, { tone: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <li className="border border-rule rounded-lg p-4 bg-surface">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            {run.client?.primaryColor && (
              <span
                className="h-3 w-3 rounded-full flex-none"
                style={{ background: run.client.primaryColor }}
                aria-hidden
              />
            )}
            <span className="font-display font-semibold text-base truncate">
              {run.client?.name ?? "Unknown client"}
            </span>
            <span className="text-sm text-ink-muted">
              · {run.template?.name ?? "Template"}
            </span>
            <span className="text-sm text-ink-muted">
              · {run.monthLabel ?? "Newsletter"}
            </span>
          </div>
          <div className="text-2xs text-ink-muted">
            Approved by {approvedByLabel}
            {approvedAt ? ` · ${approvedAt}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {webPdfHref ? (
            <a
              href={webPdfHref}
              download
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rule bg-surface hover:bg-rule/30 text-sm"
            >
              Web PDF
            </a>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              Web PDF
            </Button>
          )}
          {printPdfHref ? (
            <a
              href={printPdfHref}
              download
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rule bg-surface hover:bg-rule/30 text-sm"
            >
              Print PDF
            </a>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              Print PDF
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            loading={refreshing}
            onClick={downloadBundle}
          >
            📦 InDesign bundle
          </Button>
          <Link
            to={previewHref}
            className="text-sm text-accent hover:underline"
          >
            Open preview →
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Backend stores raw filesystem paths on `run.pdfPath` / `run.printPdfPath`
 * (see `pdfPathToUrl` in routes/runs.ts). The static handler mounts them
 * under `/pdfs/<filename>`. Mirror that convention here.
 */
function pdfPathToDownloadUrl(p?: string | null): string | null {
  if (!p) return null;
  const parts = p.split(/[\\/]/);
  const filename = parts[parts.length - 1];
  return filename ? `/pdfs/${filename}` : null;
}
