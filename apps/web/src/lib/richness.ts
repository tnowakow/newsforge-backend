import type { Richness } from "@newsforge/shared";

export const RICHNESS_LABEL: Record<Richness, string> = {
  SIMPLE: "Simple",
  MODERATE: "Moderate",
  RICH: "Rich",
  EXTRA_RICH: "Extra-Rich",
};

export const RICHNESS_STYLE: Record<Richness, string> = {
  SIMPLE: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  MODERATE: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  RICH: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  EXTRA_RICH: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
};

export const RICHNESS_ORDER: Richness[] = ["SIMPLE", "MODERATE", "RICH", "EXTRA_RICH"];
