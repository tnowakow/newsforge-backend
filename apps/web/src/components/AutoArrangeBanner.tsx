/**
 * AutoArrangeBanner — Sofia Screen 2.
 *
 * Sits above the Workspace content area. Reads `run.layoutFitReport` and
 * `run.templateId` (resolved via the template list) and surfaces the fit
 * summary + two escape hatches. Collapses to sessionStorage per runId.
 *
 * Buttons are gated per Sofia's approval-status matrix: when the run is
 * approved they render disabled with a tooltip.
 */
import { useEffect, useState } from "react";
import type {
  LayoutFitReport,
  ApprovalStatusWire,
  TemplateRecord,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";

interface Props {
  runId: string;
  report: LayoutFitReport | null | undefined;
  templates: TemplateRecord[];
  approvalStatus: ApprovalStatusWire;
  /** Total articles the operator originally submitted (pre-truncation). */
  submittedArticleCount: number;
  aiRearranging?: boolean;
  aiFellBack?: boolean;
  onChangeTemplate: () => void;
  onAiRearrange: () => void;
}

const collapseKey = (runId: string) => `nf.autoArrangeBanner.${runId}`;

export function AutoArrangeBanner({
  runId,
  report,
  templates,
  approvalStatus,
  submittedArticleCount,
  aiRearranging = false,
  aiFellBack = false,
  onChangeTemplate,
  onAiRearrange,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(collapseKey(runId)) === "collapsed";
    } catch {
      return false;
    }
  });

  // Reset collapsed when a new runId appears
  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem(collapseKey(runId)) === "collapsed");
    } catch {
      setCollapsed(false);
    }
  }, [runId]);

  if (!report) return null;

  const chosenTemplate = templates.find((t) => t.id === report.chosenTemplateId);
  const chosenName = chosenTemplate?.name ?? "Template";
  const placed = report.articleFit.length;
  const total = Math.max(submittedArticleCount, placed);
  const unusedPhotos = report.photoFit.filter((p) => p.dropped).length;
  const warnings = report.warnings ?? [];

  const approved = approvalStatus === "approved";
  const disabledReason = approved
    ? "Run is approved — request changes on Preview to unlock"
    : undefined;

  const setCollapse = (next: boolean) => {
    setCollapsed(next);
    try {
      if (next) sessionStorage.setItem(collapseKey(runId), "collapsed");
      else sessionStorage.removeItem(collapseKey(runId));
    } catch {
      // ignore
    }
  };

  if (collapsed) {
    return (
      <div
        role="region"
        aria-label="Auto-arrange summary"
        className="border-l-2 border-accent bg-accent-soft px-4 h-8 flex items-center gap-3 text-xs text-ink"
      >
        <span aria-hidden>✨</span>
        <span className="font-medium truncate">
          {chosenName} · {placed}/{total} · {unusedPhotos} unused
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="text-ink-muted hover:text-ink underline underline-offset-2"
            onClick={() => setCollapse(false)}
          >
            Expand
          </button>
          <button
            className="text-ink-muted hover:text-ink underline underline-offset-2"
            disabled={approved}
            title={disabledReason}
            onClick={onChangeTemplate}
          >
            Change…
          </button>
          <button
            aria-label="Dismiss"
            className="text-ink-muted hover:text-ink px-1"
            onClick={() => setCollapse(true)}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Auto-arrange summary"
      className={`relative border-l-2 border-accent bg-accent-soft px-6 py-3 flex items-start gap-4 min-h-[60px] ${
        aiFellBack ? "border-l-warn" : ""
      }`}
    >
      <span className="text-accent text-lg mt-0.5" aria-hidden>
        ✨
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">
          {aiRearranging ? (
            <span className="italic text-ink-muted">
              AI is re-arranging…
            </span>
          ) : (
            <>
              We picked{" "}
              <span className="font-semibold">{chosenName}</span>
              <span className="text-ink-muted">
                {" · "}
                {placed} of {total} article{total === 1 ? "" : "s"} placed
              </span>
              {unusedPhotos > 0 ? (
                <span className="text-ink-muted">
                  {" · "}
                  {unusedPhotos} photo{unusedPhotos === 1 ? "" : "s"} unused
                </span>
              ) : (
                <span className="text-ink-muted"> · all photos placed</span>
              )}
              {aiFellBack && (
                <span className="text-warn"> · AI fell back to deterministic pick.</span>
              )}
            </>
          )}
        </div>
        {aiRearranging && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded bg-rule/40">
            <div className="h-full w-1/3 bg-accent animate-pulse" />
          </div>
        )}
        {warnings.length > 0 && !aiRearranging && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {warnings.slice(0, 4).map((w, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn text-2xs px-2 h-5"
              >
                <span aria-hidden>!</span>
                {w}
              </span>
            ))}
            {warnings.length > 4 && (
              <span className="text-2xs text-ink-muted">
                +{warnings.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-none">
        <Button
          variant="secondary"
          size="sm"
          disabled={approved || aiRearranging}
          title={disabledReason}
          onClick={onChangeTemplate}
        >
          Change template
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={approved}
          aria-busy={aiRearranging}
          title={disabledReason}
          onClick={onAiRearrange}
        >
          {aiRearranging ? "Working…" : "AI Re-arrange"}
        </Button>
        <button
          aria-label="Collapse banner"
          className="text-ink-muted hover:text-ink px-1 h-8"
          onClick={() => setCollapse(true)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
