import type { Richness } from "@/lib/types";
import { cn } from "@/lib/cn";

const RICHNESS_LABEL: Record<Richness, string> = {
  SIMPLE: "Simple",
  MODERATE: "Moderate",
  RICH: "Rich",
  EXTRA_RICH: "Extra-Rich",
};

// Porter brand-aligned richness colors (restored from v1)
const RICHNESS_STYLE: Record<Richness, string> = {
  SIMPLE: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  MODERATE: "bg-porter-50 text-porter ring-1 ring-porter-100",
  RICH: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  EXTRA_RICH: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
};

export function RichnessBadge({
  level,
  className,
}: {
  level: Richness;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        RICHNESS_STYLE[level],
        className,
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-current opacity-70"
        aria-hidden
      />
      {RICHNESS_LABEL[level]}
    </span>
  );
}
