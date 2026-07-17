/**
 * ApprovalStrip — Sofia Screen 8.
 *
 * Sticky footer on the Preview page. Four states:
 *   - pending           → [Request changes] [Approve]
 *   - request-changes flow (inline notes textarea)
 *   - changes_requested → notes echo + [Approve]
 *   - approved          → download row + [Request changes]
 *
 * Approval flow is deliberately unauthenticated (v2 §4.D + sprint brief
 * Rule 3). `approvedBy` / `requestedBy` are optional free-form names.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import type {
  ApprovalStatusWire,
  RunRecord,
} from "@/lib/types";
import { useToast } from "@/lib/toast";

interface Props {
  run: RunRecord;
  status: ApprovalStatusWire;
  unresolvedComplianceCount: number;
  /** Cached download URLs (from prior approve response, if any). */
  pdfWebUrl: string | null;
  pdfPrintUrl: string | null;
  bundleUrl: string | null;
  onRunUpdated: (updates: {
    run?: RunRecord;
    pdfWebUrl?: string | null;
    pdfPrintUrl?: string | null;
    bundleUrl?: string | null;
  }) => void;
  onOpenCompliance: () => void;
}

export function ApprovalStrip({
  run,
  status,
  unresolvedComplianceCount,
  pdfWebUrl,
  pdfPrintUrl,
  bundleUrl,
  onRunUpdated,
  onOpenCompliance,
}: Props) {
  const { toast } = useToast();
  const [approving, setApproving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [actorName, setActorName] = useState("");
  const [notesPopoverOpen, setNotesPopoverOpen] = useState(false);
  const [bundleRefreshing, setBundleRefreshing] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await api.approve(run.id, actorName.trim() || undefined);
      onRunUpdated({
        run: result.run,
        pdfWebUrl: result.pdfWebUrl,
        pdfPrintUrl: result.pdfPrintUrl,
        bundleUrl: result.bundleUrl,
      });
      if (result.errors && result.errors.length > 0) {
        toast(`Approved with warnings: ${result.errors.join(", ")}`, {
          tone: "warn",
        });
      } else {
        toast("Approved. Artifacts ready to download.", { tone: "success" });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't approve.";
      toast(`Couldn't approve — ${msg}. Try again.`, { tone: "error" });
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitChanges = async () => {
    const trimmed = notes.trim();
    if (trimmed.length === 0) return;
    setRequesting(true);
    try {
      const { run: updated } = await api.requestChanges(
        run.id,
        trimmed,
        actorName.trim() || undefined,
      );
      onRunUpdated({ run: updated });
      setShowChangesForm(false);
      setNotes("");
      toast("Changes requested.", { tone: "success" });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't submit.";
      toast(msg, { tone: "error" });
    } finally {
      setRequesting(false);
    }
  };

  const handleBundleDownload = async () => {
    if (bundleUrl) {
      window.open(bundleUrl, "_self");
      toast("InDesign bundle download started", { tone: "success" });
      return;
    }
    // Refresh: signed URL missing or expired.
    setBundleRefreshing(true);
    try {
      const result = await api.exportBundle(run.id);
      onRunUpdated({ bundleUrl: result.bundleUrl });
      window.open(result.bundleUrl, "_self");
      const mb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      toast(`InDesign bundle ready — ${mb} MB, layout v${result.layoutVersion}`, {
        tone: "success",
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Bundle build failed.";
      toast(msg, { tone: "error" });
    } finally {
      setBundleRefreshing(false);
    }
  };

  const approvedAt = run.approvedAt
    ? new Date(run.approvedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : null;
  const approvedByLabel = run.approvedBy?.trim() || "(unspecified)";

  return (
    <div
      role="region"
      aria-label="Approval controls"
      className="fixed left-0 right-0 bottom-0 z-30 bg-surface border-t border-rule px-6 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.15)]"
    >
      {status === "pending" && !showChangesForm && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <StatusDot tone="warn" />
            <span className="text-sm font-medium">Status: Pending</span>
            {unresolvedComplianceCount > 0 && (
              <button
                onClick={onOpenCompliance}
                className="text-2xs text-warn hover:underline"
              >
                ⚠ {unresolvedComplianceCount} compliance flag
                {unresolvedComplianceCount === 1 ? "" : "s"} unresolved
              </button>
            )}
            <span className="text-2xs text-ink-muted ml-2">
              Demo mode — no login required to approve.
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowChangesForm(true)}
            disabled={approving}
          >
            Request changes
          </Button>
          <Button variant="primary" onClick={handleApprove} loading={approving}>
            {approving ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}

      {status !== "approved" && showChangesForm && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">What needs to change?</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            placeholder="e.g. Move the resident spotlight to page 2, swap the birthday photo…"
            className="w-full font-mono text-sm p-2 bg-surface border border-rule rounded-md focus:border-accent focus:outline-none resize-none"
          />
          <div className="flex items-center gap-3">
            <label className="text-2xs text-ink-muted flex items-center gap-1.5">
              Your name (optional):
              <input
                value={actorName}
                onChange={(e) => setActorName(e.target.value.slice(0, 200))}
                className="h-7 px-2 bg-surface border border-rule rounded text-xs w-40"
              />
            </label>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowChangesForm(false);
                  setNotes("");
                }}
                disabled={requesting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitChanges}
                loading={requesting}
                disabled={notes.trim().length === 0}
              >
                Submit changes request
              </Button>
            </div>
          </div>
        </div>
      )}

      {status === "changes_requested" && !showChangesForm && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <StatusDot tone="accent" />
            <span className="text-sm font-medium">
              ⟳ Changes requested
              {run.approvedBy ? ` by ${run.approvedBy}` : ""}
              {approvedAt ? ` · ${approvedAt}` : ""}
            </span>
            {run.approvalNotes && (
              <div className="relative">
                <span className="text-2xs text-ink-muted italic truncate max-w-md inline-block align-middle">
                  “{run.approvalNotes.slice(0, 80)}
                  {run.approvalNotes.length > 80 ? "…" : ""}”
                </span>
                <button
                  onClick={() => setNotesPopoverOpen((v) => !v)}
                  className="ml-2 text-2xs text-accent hover:underline"
                >
                  [view]
                </button>
                {notesPopoverOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-96 bg-surface border border-rule rounded-md shadow-card-hover p-3 text-sm z-10 whitespace-pre-wrap">
                    {run.approvalNotes}
                    <div className="mt-2 text-right">
                      <button
                        className="text-2xs text-ink-muted hover:text-ink"
                        onClick={() => setNotesPopoverOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button variant="primary" onClick={handleApprove} loading={approving}>
            {approving ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}

      {status === "approved" && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <StatusDot tone="success" />
            <span className="text-sm font-medium">
              ✓ Approved · by {approvedByLabel}
              {approvedAt ? ` · ${approvedAt}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {pdfWebUrl && (
              <a
                href={pdfWebUrl}
                download
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rule bg-surface hover:bg-rule/30 text-sm"
              >
                ⬇ Download Web PDF
              </a>
            )}
            {pdfPrintUrl && (
              <a
                href={pdfPrintUrl}
                download
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rule bg-surface hover:bg-rule/30 text-sm"
              >
                ⬇ Download Print PDF
              </a>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBundleDownload}
              loading={bundleRefreshing}
            >
              📦 Download InDesign bundle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowChangesForm(true)}
            >
              Request changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ tone }: { tone: "warn" | "success" | "accent" }) {
  const cls =
    tone === "warn"
      ? "bg-warn"
      : tone === "success"
        ? "bg-success"
        : "bg-accent";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}
