import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "blue" | "amber" | "plum" | "green" | "red" | "warn";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: "bg-rule/60 text-ink-muted",
  blue: "bg-porter-50 text-porter",
  amber: "bg-[#FFF8E1] text-[#9A6B00]",  // Gold accent (v1 richness indicator)
  plum: "bg-[#F3E6F4] text-[#6A2A7A]",
  green: "bg-success/15 text-success",
  red: "bg-error/10 text-error",
  warn: "bg-warn/10 text-warn",
};

export function Tag({ tone = "neutral", className, children, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
