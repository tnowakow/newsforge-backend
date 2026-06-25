import { cn } from "../lib/cn";

interface Swatch {
  label: string;
  color: string;
}

export function ColorSwatches({
  primary,
  secondary,
  accent,
  size = "sm",
  showLabels = false,
  className,
}: {
  primary: string;
  secondary: string;
  accent: string;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
  className?: string;
}) {
  const swatches: Swatch[] = [
    { label: "Primary", color: primary },
    { label: "Secondary", color: secondary },
    { label: "Accent", color: accent },
  ];
  const sizeCls =
    size === "lg"
      ? "w-10 h-10"
      : size === "md"
        ? "w-7 h-7"
        : "w-5 h-5";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {swatches.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              sizeCls,
              "rounded-full ring-1 ring-black/10 shadow-sm shrink-0",
            )}
            style={{ backgroundColor: s.color }}
            title={`${s.label}: ${s.color}`}
            aria-label={`${s.label} color ${s.color}`}
          />
          {showLabels && (
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {s.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
