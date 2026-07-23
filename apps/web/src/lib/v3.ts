/**
 * v3 — frontend design-language mirror.
 * MUST stay in sync with apps/api/src/services/designLanguage.ts
 * (Riley: parity test asserts these objects match).
 */
import type { ClientFull, PanelToken } from "@/lib/types";

export const FIXED_PALETTE: Record<string, string> = {
  sun: "#F2E76B",
  navy: "#1F2A44",
  coral: "#E8762C",
  sky: "#7FB6D9",
  berry: "#B183C4",
  leaf: "#6FAE6B",
  blush: "#E9A0B4",
  cream: "#FAF3E2",
  paper: "#FFFFFF",
};

export const DARK_TOKENS = new Set<PanelToken>(["navy", "primary"]);

export function resolveToken(
  token: PanelToken | undefined,
  client: Pick<ClientFull, "primaryColor" | "secondaryColor" | "accentColor">,
): string | null {
  if (!token || token === "paper") return null;
  if (token === "primary") return client.primaryColor;
  if (token === "secondary") return client.secondaryColor;
  if (token === "accent") return client.accentColor;
  return FIXED_PALETTE[token] ?? null;
}

/** Infer the template grid width from block extents (12 legacy / 24 v3). */
export function inferColumns(blocks: Array<{ position: { col: number; colSpan: number } }>): number {
  const maxEnd = Math.max(
    12,
    ...blocks.map((b) => b.position.col + b.position.colSpan - 1),
  );
  return maxEnd > 12 ? 24 : 12;
}

export function inferRows(blocks: Array<{ page: number; position: { row: number; rowSpan: number } }>): number {
  const maxEnd = Math.max(
    10,
    ...blocks.map((b) => b.position.row + b.position.rowSpan - 1),
  );
  return maxEnd > 10 ? 16 : 10;
}
