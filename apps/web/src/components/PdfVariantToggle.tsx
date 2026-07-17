/**
 * PdfVariantToggle — Sofia Screen 7.
 *
 * Segmented control; default `web` per Vitaly rule 19. Applies a CSS class
 * to the preview surface (`web-mode` vs `print-mode print-bleed`) — the
 * consumer wires the class onto the preview container.
 */
import { cn } from "@/lib/cn";

export type PdfVariant = "web" | "print";

interface Props {
  value: PdfVariant;
  onChange: (v: PdfVariant) => void;
  disabled?: boolean;
}

export function PdfVariantToggle({ value, onChange, disabled = false }: Props) {
  return (
    <div
      role="tablist"
      aria-label="PDF variant"
      className="inline-flex bg-rule/40 rounded-md p-0.5"
    >
      {(["web", "print"] as const).map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "px-3 h-8 rounded text-sm transition-colors",
              active
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {v === "web" ? "Web PDF" : "Print PDF"}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The SVG crop-marks overlay Sofia specced from Vitaly §9.3. Drop this
 * inside the preview surface when the print variant is active. Purely
 * decorative — never rendered into the PDF (server draws its own).
 */
export function CropMarksOverlay() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1125 1725"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 w-full h-full"
    >
      {/* top-left */}
      <line x1="0" y1="12.5" x2="9" y2="12.5" stroke="black" strokeWidth="0.5" />
      <line x1="12.5" y1="0" x2="12.5" y2="9" stroke="black" strokeWidth="0.5" />
      {/* top-right */}
      <line x1="1116" y1="12.5" x2="1125" y2="12.5" stroke="black" strokeWidth="0.5" />
      <line x1="1112.5" y1="0" x2="1112.5" y2="9" stroke="black" strokeWidth="0.5" />
      {/* bottom-left */}
      <line x1="0" y1="1712.5" x2="9" y2="1712.5" stroke="black" strokeWidth="0.5" />
      <line x1="12.5" y1="1716" x2="12.5" y2="1725" stroke="black" strokeWidth="0.5" />
      {/* bottom-right */}
      <line x1="1116" y1="1712.5" x2="1125" y2="1712.5" stroke="black" strokeWidth="0.5" />
      <line x1="1112.5" y1="1716" x2="1112.5" y2="1725" stroke="black" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * Small legend row that only renders in the print variant. Kept as a
 * separate export so callers can position it wherever their preview
 * layout wants it.
 */
export function PdfVariantLegend() {
  return (
    <div className="text-2xs text-ink-muted flex items-center gap-4">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-4 h-3 bg-accent-soft border border-accent/40" />
        Bleed area (trims off)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono">⌐ ¬</span>
        Crop marks
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-4 h-3 border border-dashed border-ink-muted/60" />
        Safe area
      </span>
    </div>
  );
}
