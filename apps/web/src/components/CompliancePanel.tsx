/**
 * CompliancePanel — Sofia Screen 3.
 *
 * Right-side drawer (400px). Groups flags by severity: block → warn → info.
 * Ack state is client-side only (Sofia Screen 3 Data source note): stored
 * via `api.acknowledgeComplianceFlag`. If Marcus ever ships a server ack
 * endpoint, swap `onAcknowledge` to also POST there.
 *
 * Bell/badge button lives in the Workspace toolbar and is exported as
 * `<ComplianceBellButton>` for convenience.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  Article,
  ComplianceFlag,
  ComplianceSeverity,
  NewsImage,
} from "@/lib/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string;
  flags: ComplianceFlag[] | null | undefined;
  articles: Article[];
  images: NewsImage[];
  approvalStatus: "pending" | "approved" | "changes_requested";
  /** If Marcus goes async and never returns flags, drawer shows partial state. */
  polling?: boolean;
}

const SEVERITY_ORDER: ComplianceSeverity[] = ["block", "warn", "info"];
const SEVERITY_LABEL: Record<ComplianceSeverity, string> = {
  block: "BLOCK",
  warn: "WARN",
  info: "INFO",
};
const SEVERITY_CLASS: Record<
  ComplianceSeverity,
  { header: string; tint: string; dot: string }
> = {
  block: {
    header: "text-error",
    tint: "bg-error/5 border-l-2 border-error",
    dot: "bg-error",
  },
  warn: {
    header: "text-warn",
    tint: "bg-warn/5 border-l-2 border-warn",
    dot: "bg-warn",
  },
  info: {
    header: "text-ink-muted",
    tint: "bg-rule/20 border-l-2 border-rule",
    dot: "bg-ink-muted",
  },
};

export function CompliancePanel({
  open,
  onClose,
  runId,
  flags,
  articles,
  images,
  approvalStatus,
  polling = false,
}: Props) {
  // Force re-render when ack state changes (sessionStorage is imperative).
  const [ackTick, setAckTick] = useState(0);

  useEffect(() => {
    // ESC to close
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const list = flags ?? [];
    const map: Record<ComplianceSeverity, ComplianceFlag[]> = {
      block: [],
      warn: [],
      info: [],
    };
    for (const f of list) map[f.severity].push(f);
    return map;
  }, [flags]);

  const partial = (flags ?? []).some(
    (f) => f.severity === "info" && /compliance_partial/i.test(f.reason),
  );

  const totalCount = flags?.length ?? 0;
  const blockCount = groups.block.length;
  const warnCount = groups.warn.length;
  const infoCount = groups.info.length;

  const unresolvedCount = (flags ?? []).filter(
    (f) => !api.isComplianceFlagAcknowledged(runId, f.id),
  ).length;
  void ackTick; // keep the state; the memo above already re-runs

  const acknowledgeAll = () => {
    for (const f of flags ?? []) {
      api.acknowledgeComplianceFlag(runId, f.id);
    }
    setAckTick((n) => n + 1);
  };

  if (!open) return null;

  return (
    <>
      {/* Scrim (below modals but above workspace) */}
      <div
        aria-hidden
        className="fixed inset-0 z-30 bg-black/10"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Compliance flags"
        className="fixed top-16 right-0 bottom-0 w-[400px] z-40 bg-surface border-l border-rule flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-rule flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-base">
              Compliance
            </div>
            <div className="text-2xs text-ink-muted mt-0.5">
              {totalCount === 0
                ? "No flags"
                : `${totalCount} flag${totalCount === 1 ? "" : "s"} · ${blockCount} block · ${warnCount} warn · ${infoCount} info`}
              {approvalStatus === "approved" && (
                <span className="ml-2 inline-block bg-accent-soft text-accent rounded-full px-2 text-2xs">
                  Approved · flags are historical
                </span>
              )}
            </div>
          </div>
          <button
            aria-label="Close compliance drawer"
            className="text-ink-muted hover:text-ink text-lg leading-none px-2 -mr-1"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Partial banner (Vitaly §8.4) */}
        {partial && (
          <div className="mx-3 mt-3 text-2xs text-warn bg-warn/10 border border-warn/30 rounded-md px-2 py-1.5">
            Compliance check partial — Gemini call failed on some items.
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {polling && (!flags || flags.length === 0) && (
            <div className="text-center text-sm text-ink-muted py-10">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin mr-2 align-middle" />
              Checking for compliance issues…
            </div>
          )}
          {!polling && totalCount === 0 && (
            <div className="text-center text-sm text-ink-muted py-10">
              No compliance issues on this run. ✅
            </div>
          )}
          {totalCount > 0 &&
            SEVERITY_ORDER.map((sev) => {
              const list = groups[sev];
              if (list.length === 0) return null;
              const allAcked = list.every((f) =>
                api.isComplianceFlagAcknowledged(runId, f.id),
              );
              return (
                <section key={sev} className="mb-4">
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${
                      allAcked
                        ? "text-ink-muted"
                        : SEVERITY_CLASS[sev].header
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${SEVERITY_CLASS[sev].dot}`}
                    />
                    {SEVERITY_LABEL[sev]}
                    <span className="text-ink-muted font-normal normal-case">
                      · {list.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {list.map((flag) => (
                      <FlagCard
                        key={flag.id}
                        runId={runId}
                        flag={flag}
                        articles={articles}
                        images={images}
                        tintClass={SEVERITY_CLASS[sev].tint}
                        onAck={() => setAckTick((n) => n + 1)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-rule flex items-center justify-between">
          <div className="text-2xs text-ink-muted">
            {unresolvedCount} unresolved
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={unresolvedCount === 0}
            onClick={acknowledgeAll}
          >
            Acknowledge all
          </Button>
        </div>
      </aside>
    </>
  );
}

function FlagCard({
  runId,
  flag,
  articles,
  images,
  tintClass,
  onAck,
}: {
  runId: string;
  flag: ComplianceFlag;
  articles: Article[];
  images: NewsImage[];
  tintClass: string;
  onAck: () => void;
}) {
  const acked = api.isComplianceFlagAcknowledged(runId, flag.id);
  const target = flag.target;
  const isArticle = target.kind === "article";
  const article = target.kind === "article"
    ? articles.find((a) => a.id === target.articleId)
    : null;
  const image = target.kind === "image"
    ? images.find((img) => img.id === target.imageId)
    : null;

  return (
    <li
      className={`rounded-md p-3 text-sm ${tintClass} ${acked ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-2xs uppercase tracking-wider text-ink-muted">
            {flag.category}
          </div>
          {isArticle && flag.target.kind === "article" && (
            <>
              {flag.target.match && (
                <div className="text-ink mt-1 italic truncate">
                  “{flag.target.match}”
                </div>
              )}
              {article && (
                <div className="text-2xs text-ink-muted mt-0.5">
                  Article: {article.title}
                </div>
              )}
            </>
          )}
          {!isArticle && flag.target.kind === "image" && (
            <div className="flex items-center gap-2 mt-1">
              {image?.url && (
                <img
                  src={image.url}
                  alt={image.alt ?? "flagged image"}
                  className="h-10 w-14 object-cover rounded border border-rule flex-none"
                  loading="lazy"
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-ink">
                  {image?.alt ?? image?.caption ?? flag.target.imageId}
                </div>
                <div className="text-2xs text-ink-muted truncate">
                  {flag.reason}
                </div>
              </div>
            </div>
          )}
          {isArticle && (
            <div className="text-2xs text-ink-muted mt-1">{flag.reason}</div>
          )}
          <div className="text-2xs font-mono text-ink-muted/70 mt-1">
            {flag.detectorVersion}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        {acked ? (
          <span className="text-2xs text-ink-muted inline-flex items-center gap-1">
            ✓ Acknowledged
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              api.acknowledgeComplianceFlag(runId, flag.id);
              onAck();
            }}
          >
            Acknowledge
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Compliance bell + badge, drop into the workspace toolbar.
 */
export function ComplianceBellButton({
  runId,
  flags,
  onClick,
}: {
  runId: string;
  flags: ComplianceFlag[] | null | undefined;
  onClick: () => void;
}) {
  const list = flags ?? [];
  const unresolved = list.filter(
    (f) => !api.isComplianceFlagAcknowledged(runId, f.id),
  );
  const count = unresolved.length;
  const topSeverity: ComplianceSeverity | null = unresolved.some(
    (f) => f.severity === "block",
  )
    ? "block"
    : unresolved.some((f) => f.severity === "warn")
      ? "warn"
      : unresolved.some((f) => f.severity === "info")
        ? "info"
        : null;

  const badgeClass =
    topSeverity === "block"
      ? "bg-error text-white"
      : topSeverity === "warn"
        ? "bg-warn text-white"
        : "bg-ink-muted text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-2 h-8 px-3 rounded-md border border-rule hover:border-ink/30 hover:bg-rule/30 text-sm"
      aria-label={`Compliance flags: ${count} unresolved`}
      title="Compliance flags"
    >
      <span aria-hidden>🔔</span>
      <span>Compliance</span>
      {count > 0 && (
        <span
          className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-2xs font-semibold px-1 grid place-items-center ${badgeClass}`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
