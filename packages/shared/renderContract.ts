import { z } from "zod";

/**
 * Measured print geometry. CSS pixels are used at the browser's fixed 96dpi;
 * points are retained for typography so PDF spans can be checked directly.
 */
export const PRINT_DPI = 96;
export const PT_TO_PX = PRINT_DPI / 72;

export const RenderContractSchema = z.object({
  id: z.literal("letter-inner-v1"),
  page: z.object({ widthIn: z.literal(8.5), heightIn: z.literal(11) }),
  marginsIn: z.object({ top: z.number().positive(), right: z.number().positive(), bottom: z.number().positive(), left: z.number().positive() }),
  gutterPx: z.number().nonnegative(),
  headerHeightIn: z.number().nonnegative(),
  footerHeightIn: z.number().nonnegative(),
  fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
  type: z.object({ bodyPt: z.number().min(10.5), captionPt: z.number().min(9), listPt: z.number().min(10.5), lineHeight: z.number().min(1) }),
  readable: z.literal(true),
});
export type RenderContract = z.infer<typeof RenderContractSchema>;

export const LETTER_RENDER_CONTRACT: RenderContract = {
  id: "letter-inner-v1",
  page: { widthIn: 8.5, heightIn: 11 },
  marginsIn: { top: 0.34, right: 0.34, bottom: 0.4, left: 0.34 },
  gutterPx: 4,
  headerHeightIn: 0.48,
  footerHeightIn: 0.16,
  fonts: { heading: "Georgia", body: "Georgia" },
  type: { bodyPt: 10.5, captionPt: 9, listPt: 10.5, lineHeight: 1.2 },
  readable: true,
};

export function inchesToCssPx(inches: number): number {
  return Math.round(inches * PRINT_DPI * 100) / 100;
}

export function contractCss(contract: RenderContract): string {
  const m = contract.marginsIn;
  return `width:${contract.page.widthIn}in;height:${contract.page.heightIn}in;padding:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;`;
}
