import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabSpec {
  key: string;
  label: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: TabSpec[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex items-end gap-1 border-b border-rule",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            id={`${groupId}-${t.key}`}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md",
              active
                ? "text-ink"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "text-2xs px-1.5 py-0.5 rounded-full",
                    active ? "bg-accent-soft text-accent" : "bg-rule/60 text-ink-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
            {active && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
