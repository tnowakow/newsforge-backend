/**
 * ChangeTemplateModal — Sofia Screen 5.
 *
 * Exactly 5 equal-weight cards (T1–T5 for Trilogy). No "primary" tag, no
 * ordering by fit score, no "AI picked this" ribbon beyond a neutral
 * `✓ current` chip (sprint brief Rule 4 · Sofia Screen 5).
 *
 * The re-arrange path per Sofia's handoff is `POST /api/runs/` with an
 * explicit `templateId` (which the backend accepts and does NOT re-score).
 * The parent (`Workspace`) provides `onApply` because it owns the
 * articles/images arrays needed to re-assemble.
 */
import { useMemo, useState } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { Button } from "./ui/Button";
import type { TemplateRecord } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  templates: TemplateRecord[];
  currentTemplateId: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onApply: (templateId: string) => Promise<void>;
}

export function ChangeTemplateModal({
  open,
  onClose,
  templates,
  currentTemplateId,
  disabled = false,
  disabledReason,
  onApply,
}: Props) {
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cards = useMemo(() => {
    // Trilogy has exactly 5 templates. If backend returns >5, show first 5
    // in whatever order it returned them (equal-weight rule; no re-sort).
    return templates.slice(0, 5);
  }, [templates]);

  const handleUse = async (templateId: string) => {
    if (disabled || applyingId) return;
    setApplyingId(templateId);
    setError(null);
    try {
      await onApply(templateId);
      // parent closes the modal on success
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't re-arrange";
      setError(msg);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="w-[min(1120px,95vw)]"
      labelledBy="change-template-title"
    >
      <ModalHeader
        title={<span id="change-template-title">Change template</span>}
        subtitle="Pick a template. Your content will be re-arranged."
        onClose={onClose}
      />
      <div className="p-5">
        {disabled && disabledReason && (
          <div className="mb-4 text-sm text-warn bg-warn/10 border border-warn/30 rounded-md px-3 py-2">
            {disabledReason}
          </div>
        )}
        {error && (
          <div className="mb-3 text-sm text-error bg-error/5 border border-error/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {cards.length === 0 ? (
          <div className="text-sm text-ink-muted py-10 text-center">
            No templates available for this client.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((t) => {
              const isCurrent = t.id === currentTemplateId;
              const isApplying = applyingId === t.id;
              const otherApplying = applyingId !== null && !isApplying;
              return (
                <div
                  key={t.id}
                  className={`relative border rounded-lg overflow-hidden bg-surface flex flex-col ${
                    isCurrent ? "border-accent" : "border-rule"
                  } ${otherApplying ? "opacity-40" : ""}`}
                >
                  <TemplatePreview template={t} />
                  <div className="p-3 flex flex-col gap-1.5 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {t.name}
                    </div>
                    <div className="text-2xs text-ink-muted">
                      {t.pageCount}pp · {slotCount(t)}sl
                    </div>
                    {isCurrent && (
                      <div className="text-2xs text-accent font-medium">
                        ✓ current
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant={isCurrent ? "secondary" : "primary"}
                      className="mt-auto"
                      disabled={disabled || otherApplying}
                      loading={isApplying}
                      onClick={() => handleUse(t.id)}
                    >
                      {isApplying ? "Applying…" : "Use this template"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={applyingId !== null}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Small deterministic sketch of the template's page-1 grid. No image asset
 * needed — derived from `template.gridSpec.slots[]` when present, else
 * a fallback checkerboard. Kept intentionally rough per Sofia's note.
 */
function TemplatePreview({ template }: { template: TemplateRecord }) {
  const grid = extractSlots(template.gridSpec);
  return (
    <div className="aspect-[4/3] bg-rule/30 border-b border-rule relative p-2">
      <div
        className="w-full h-full grid gap-1"
        style={{ gridTemplateColumns: "repeat(12, 1fr)", gridTemplateRows: "repeat(10, 1fr)" }}
      >
        {grid.length > 0
          ? grid.slice(0, 24).map((s, i) => (
              <div
                key={i}
                className={
                  s.kind === "image"
                    ? "bg-accent/60"
                    : "bg-ink/10"
                }
                style={{
                  gridColumn: `${clamp(s.col, 1, 12)} / span ${clamp(
                    s.colSpan,
                    1,
                    13 - clamp(s.col, 1, 12),
                  )}`,
                  gridRow: `${clamp(s.row, 1, 10)} / span ${clamp(
                    s.rowSpan,
                    1,
                    11 - clamp(s.row, 1, 10),
                  )}`,
                }}
              />
            ))
          : (
            <div
              className="col-span-12 row-span-10 grid place-items-center text-2xs text-ink-muted"
            >
              (preview)
            </div>
          )}
      </div>
    </div>
  );
}

function slotCount(t: TemplateRecord): number {
  const s = extractSlots(t.gridSpec);
  return s.length;
}

interface SlotShape {
  kind: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

function extractSlots(spec: unknown): SlotShape[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as any;
  const rawSlots: any[] = Array.isArray(s.slots) ? s.slots : [];
  const page1: any[] = rawSlots.filter(
    (slot) => !slot?.page || slot.page === 1,
  );
  const source = page1.length > 0 ? page1 : rawSlots;
  return source
    .map((slot) => {
      const pos = slot.position ?? slot;
      const kind = typeof slot.type === "string" ? slot.type : "text";
      const col = Number(pos.col ?? pos.x ?? 1);
      const row = Number(pos.row ?? pos.y ?? 1);
      const colSpan = Number(pos.colSpan ?? pos.w ?? 1);
      const rowSpan = Number(pos.rowSpan ?? pos.h ?? 1);
      if (
        [col, row, colSpan, rowSpan].some((n) => !Number.isFinite(n))
      ) {
        return null;
      }
      return { kind, col, row, colSpan, rowSpan };
    })
    .filter((v): v is SlotShape => v !== null);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}
