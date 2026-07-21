import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type { ApprovalStatusWire, RunRecord } from "@/lib/types";
import { normalizeApprovalStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/lib/toast";

type SortKey = "newest" | "oldest" | "client";
type StatusFilter = "all" | ApprovalStatusWire;

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const STATUS_BADGE: Record<ApprovalStatusWire, string> = {
  pending: "border-warn/30 bg-warn/10 text-warn",
  approved: "border-success/30 bg-success/10 text-success",
  changes_requested: "border-error/30 bg-error/10 text-error",
};

export default function Approved() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  useEffect(() => {
    let cancelled = false;
    api
      .listRuns({ limit: 200 })
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

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: runs?.length ?? 0,
      pending: 0,
      approved: 0,
      changes_requested: 0,
    };
    for (const run of runs ?? []) {
      counts[normalizeApprovalStatus(run.approvalStatus)] += 1;
    }
    return counts;
  }, [runs]);

  const filtered = useMemo(() => {
    const list = runs ?? [];
    const q = query.trim().toLowerCase();
    const filteredList = list.filter((r) => {
      if (clientFilter && r.clientId !== clientFilter) return false;
      if (
        statusFilter !== "all" &&
        normalizeApprovalStatus(r.approvalStatus) !== statusFilter
      ) {
        return false;
      }
      if (!q) return true;
      const hay = `${r.client?.name ?? ""} ${r.monthLabel ?? ""} ${r.template?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    filteredList.sort((a, b) => {
      if (sortKey === "client") {
        return (a.client?.name ?? "").localeCompare(b.client?.name ?? "");
      }
      const at = Date.parse(a.updatedAt ?? a.createdAt ?? a.approvedAt ?? "") || 0;
      const bt = Date.parse(b.updatedAt ?? b.createdAt ?? b.approvedAt ?? "") || 0;
      return sortKey === "oldest" ? at - bt : bt - at;
    });
    return filteredList;
  }, [runs, query, clientFilter, statusFilter, sortKey]);

  return (
    <div className="px-10 py-8 max-w-[1120px] mx-auto">
      <header className="mb-6">
        <h1 className="font-display font-semibold text-2xl">Newsletters</h1>
        <p className="text-sm text-ink-muted mt-1">
          Browse every saved newsletter run, resume in-progress editions, and grab approved artifacts.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["all", "pending", "changes_requested", "approved"] as const).map(
          (status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`text-left border rounded-md px-3 py-2 bg-surface hover:border-ink/30 ${
                statusFilter === status ? "border-accent ring-1 ring-accent" : "border-rule"
              }`}
            >
              <div className="text-2xs uppercase text-ink-muted">
                {STATUS_LABEL[status]}
              </div>
              <div className="font-display font-semibold text-lg">
                {statusCounts[status]}
              </div>
            </button>
          ),
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <input
            aria-label="Search newsletters"
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
          <div className="font-medium mb-1">No newsletters yet</div>
          <p className="text-sm text-ink-muted mb-5">
            Assemble a newsletter and it will show up here, even before approval.
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
          No newsletters match the current filters.
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
  const updatedAt = run.updatedAt
    ? new Date(run.updatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "";
  const approvedByLabel = run.approvedBy?.trim() || "(unspecified)";
  const approvalStatus = normalizeApprovalStatus(run.approvalStatus);
  const previewHref = run.clientId
    ? `/workspace/${run.clientId}/preview?runId=${run.id}`
    : `/run/${run.id}/preview`;
  const workspaceHref = run.clientId
    ? `/workspace/${run.clientId}?runId=${run.id}`
    : previewHref;

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
            <span
              className={`text-2xs uppercase border rounded-full px-2 py-0.5 ${STATUS_BADGE[approvalStatus]}`}
            >
              {STATUS_LABEL[approvalStatus]}
            </span>
          </div>
          <div className="text-2xs text-ink-muted">
            {approvalStatus === "approved"
              ? `Approved by ${approvedByLabel}${approvedAt ? ` · ${approvedAt}` : ""}`
              : `Last updated${updatedAt ? ` · ${updatedAt}` : ""}`}
            {run.approvalNotes && approvalStatus === "changes_requested"
              ? ` · Changes: ${run.approvalNotes}`
              : ""}
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
            disabled={approvalStatus !== "approved"}
            onClick={downloadBundle}
          >
            📦 InDesign bundle
          </Button>
          {approvalStatus !== "approved" && (
            <Link
              to={workspaceHref}
              className="inline-flex items-center h-8 px-3 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90"
            >
              Resume
            </Link>
          )}
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
