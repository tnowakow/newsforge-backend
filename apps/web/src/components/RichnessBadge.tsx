import type { Richness } from "@newsforge/shared";
import { RICHNESS_LABEL, RICHNESS_STYLE } from "../lib/richness";
import { cn } from "../lib/cn";

export function RichnessBadge({
  level,
  className,
}: {
  level: Richness;
  className?: string;
}) {
  return (
    <span className={cn("chip", RICHNESS_STYLE[level], className)}>
      <span
        className="w-1.5 h-1.5 rounded-full bg-current opacity-70"
        aria-hidden
      />
      {RICHNESS_LABEL[level]}
    </span>
  );
}
