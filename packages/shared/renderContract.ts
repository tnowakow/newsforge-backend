import { z } from "zod";

/**
 * Measured print geometry. CSS pixels are used at the browser's fixed 96dpi;
 * points are retained for typography so PDF spans can be checked directly.
 *
 * TRI-R06 typography contract.
 *
 * Reference metadata (approved, commercial — NOT freely downloadable):
 *   - Porter examples: AGaramondPro-Regular 11.5pt body (dominant span),
 *     AGaramondPro-Bold 11.5pt lead-ins, AGaramondPro-BoldItalic 21–25pt
 *     display, MuseoSans-900 23–24pt kickers, MuseoSans-500 11.5pt body.
 *   - Phase-0 Trilogy baseline (current-tested-output.pdf): Type3 glyph
 *     outlines only (no real font embedded), body ~9–9.2pt, headings
 *     14.7–18pt — the silent-fallback defect this contract replaces.
 *
 * Both approved faces are commercial (Adobe / Typewolf). Per the card's
 * sanctioned path we propose explicit OFL open-source substitutes, installed
 * system-wide for the Chromium renderer (fontconfig) at
 *   ~/.local/share/fonts/newsforge/
 * and retained in-repo at packages/shared/fonts/ for the Docker image:
 *   - EB Garamond  (variable, Regular…Bold)    → substitutes AGaramondPro (serif, body)
 *   - Source Sans 3 (variable, ExtraLight…Black) → substitutes Museo Sans (sans, headings)
 *
 * Font availability is EXPLICIT and never silent:
 *   - pdf.ts hard-checks that BOTH declared families are loadable via the
 *     Font Loading API before generating the PDF, AND inspects the computed
 *     body font-family so it can detect a silent FreeSerif/generic fallback
 *     and throw rather than ship a wrong-face PDF.
 *   - The fallback stack declares a generic family (serif/sans-serif) as a
 *     last resort only; it is not a substitute for the explicit availability
 *     check. FreeSerif is deliberately NOT in any stack.
 *
 * Line-height measured across 18 Porter reference PDFs: body line pitch
 * clusters ~1.30–1.40 (median ≈1.38) at 11.5pt, so we pin body at 1.38.
 * Display (23pt) uses a tighter 1.05 — kickers in the references are
 * single-line, tight-set.
 */

export const PRINT_DPI = 96;
export const PT_TO_PX = PRINT_DPI / 72;

/** One named typography role. Size is physical points, verified in rendered output. */
const RoleSchema = z.object({
  /** CSS font-family stack for this role (first family is the primary). */
  fontStack: z.string().min(3),
  /** Weight applied to primary body of this role (100–900). */
  weight: z.number().int().min(100).max(900),
  /** Physical point size of the primary text in this role. */
  pt: z.number().min(6),
  /** Line-height (unitless multiple of pt). */
  lineHeight: z.number().min(0.9).max(2.2),
  /** Measured reference note for traceability (free-form). */
  measuredNote: z.string().optional(),
});

export const RenderContractSchema = z.object({
  id: z.literal("letter-inner-v1"),
  page: z.object({ widthIn: z.literal(8.5), heightIn: z.literal(11) }),
  marginsIn: z.object({ top: z.number().positive(), right: z.number().positive(), bottom: z.number().positive(), left: z.number().positive() }),
  gutterPx: z.number().nonnegative(),
  headerHeightIn: z.number().nonnegative(),
  footerHeightIn: z.number().nonnegative(),
  /**
   * Backward-compat field used by pdf.ts, runs.ts, finalArtifactGate, and
   * demo-benchmark digest. Values are the PRIMARY families, NOT the full
   * stack — the stack lives in `roles.*.fontStack`.
   */
  fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
  /** Explicit availability declaration. `strict` means "throw if a declared
   *  family is not loadable by the renderer" (never fall back silently). */
  fontAvailability: z.object({
    /** Hard-fail if a required family is not loadable (never fall back silently). */
    strict: z.literal(true),
    /** Families the renderer MUST be able to load. Checked at PDF time via the
     *  Font Loading API; a miss throws instead of silently substituting. */
    required: z.array(z.string().min(1)).min(1),
    /** Generic fallback families declared in the contract. This is what makes
     *  the fallback EXPLICIT (contract-declared) rather than SILENT (an
     *  implicit browser substitution to FreeSerif). FreeSerif is not declared
     *  anywhere in any stack. */
    declaredFallbacks: z.array(z.enum(["serif", "sans-serif", "system-ui"])).min(1),
    /** Explicit substitution proposal (approved commercial face → OFL substitute),
     *  per the card's sanctioned path. */
    substitutions: z.array(
      z.object({
        approvedFace: z.string(),
        substitute: z.string(),
        license: z.enum(["OFL", "commercial"]),
        rationale: z.string().optional(),
      }),
    ),
    /** Where the substitute files live in the repo (for the Docker image). */
    inRepoAssets: z.array(z.string()),
  }),
  /**
   * Measured, per-role typography. This is the contract that renderHtml.ts
   * consumes via `render-contract` CSS vars and pdf.ts verifies via the
   * Font Loading API.
   */
  roles: z.object({
    /** Display / kicker — large, tight-set, uppercase. Reference: MuseoSans-900 23–24pt. */
    display: RoleSchema,
    /** Section heading inside a block. Reference: AGaramondPro-Bold 11.5pt,
     *  but visually distinct as a heading (heavier, tighter). */
    heading: RoleSchema,
    /** Running body. Reference: AGaramondPro-Regular 11.5pt, pitch ≈1.38. */
    body: RoleSchema,
    /** List body (schedules, events, birthdays). Reference: 11.5pt. */
    list: RoleSchema,
    /** Photo captions. Reference: 9pt, tight. */
    caption: RoleSchema,
  }),
  /** Backward-compat `type` object (runs.ts reads type.bodyPt / type.captionPt). */
  type: z.object({
    bodyPt: z.number().min(10.5),
    captionPt: z.number().min(9),
    listPt: z.number().min(10.5),
    lineHeight: z.number().min(1),
    headingPt: z.number().min(11).optional(),
    displayPt: z.number().min(18).optional(),
  }),
  /** Column / measure rules. */
  columns: z.object({
    /** Logical column count (matches GridSpecSchema max 24, typical 12). */
    count: z.number().int().min(1).max(24),
    /** Inter-column gutter in CSS px (matches gutterPx at top level). */
    gutterPx: z.number().nonnegative(),
    /** Max comfortable line length in characters for a single column.
     *  Reference Porter body columns are ~62–68 chars. */
    maxMeasureChars: z.number().int().min(40).max(90),
    /** Min comfortable line length in characters. */
    minMeasureChars: z.number().int().min(30).max(60),
  }),
  readable: z.literal(true),
});

export type RenderContract = z.infer<typeof RenderContractSchema>;

/**
 * Canonical letter contract for Trilogy inner pages (pages 2 & 3).
 *
 * Values below are MEASURED from the Porter reference PDFs (see header
 * comment), not scaled uniformly. Substitute families are declared per
 * role with an explicit generic fallback and an availability check that
 * throws — no silent FreeSerif substitution is possible.
 */
export const LETTER_RENDER_CONTRACT: RenderContract = {
  id: "letter-inner-v1",
  page: { widthIn: 8.5, heightIn: 11 },
  marginsIn: { top: 0.34, right: 0.34, bottom: 0.4, left: 0.34 },
  gutterPx: 4,
  headerHeightIn: 0.48,
  footerHeightIn: 0.16,

  // Backward-compat primary families (pdf.ts / runs.ts / digest).
  fonts: { heading: "Source Sans 3", body: "EB Garamond" },

  fontAvailability: {
    strict: true,
    required: ["EB Garamond", "Source Sans 3"],
    declaredFallbacks: ["serif", "sans-serif"],
    substitutions: [
      {
        approvedFace: "Adobe Garamond Pro (AGaramondPro)",
        substitute: "EB Garamond",
        license: "OFL",
        rationale:
          "AGaramondPro is a commercial Adobe face (not freely downloadable). " +
          "EB Garamond is an OFL open-source revival in the same Garamond lineage; " +
          "variable Regular…Bold covers the reference weights (Regular, Bold, " +
          "Semibold, Italic display).",
      },
      {
        approvedFace: "Museo Sans",
        substitute: "Source Sans 3",
        license: "OFL",
        rationale:
          "Museo Sans is a commercial Typewolf face (not freely downloadable). " +
          "Source Sans 3 is an OFL open-source neutral sans with the full " +
          "ExtraLight…Black weight range, covering the reference MuseoSans-500/700/900 usage.",
      },
    ],
    inRepoAssets: ["packages/shared/fonts/EB-Garamond-Variable.ttf", "packages/shared/fonts/Source-Sans-3-Variable.ttf"],
  },

  // Measured per-role typography (see header).
  roles: {
    display: {
      fontStack: `"Source Sans 3", "Museo Sans", sans-serif`,
      weight: 900,
      pt: 23,
      lineHeight: 1.05,
      measuredNote: "MuseoSans-900 23–24pt kickers in Porter refs; tight single-line",
    },
    heading: {
      fontStack: `"Source Sans 3", "Museo Sans", sans-serif`,
      weight: 700,
      pt: 15,
      lineHeight: 1.1,
      measuredNote: "Section headings in refs run 13–18pt; 15pt at weight 700 for block-level headings",
    },
    body: {
      fontStack: `"EB Garamond", "Adobe Garamond Pro", serif`,
      weight: 400,
      pt: 11.5,
      lineHeight: 1.38,
      measuredNote: "AGaramondPro-Regular 11.5pt dominant body span; pitch median ≈1.38 across 18 Porter refs",
    },
    list: {
      fontStack: `"EB Garamond", "Adobe Garamond Pro", serif`,
      weight: 400,
      pt: 11,
      lineHeight: 1.3,
      measuredNote: "AGaramondPro-Regular/Semibold 11.5pt lists; slightly tighter for compact schedules",
    },
    caption: {
      fontStack: `"EB Garamond", "Adobe Garamond Pro", serif`,
      weight: 400,
      pt: 9,
      lineHeight: 1.15,
      measuredNote: "Photo captions in refs run ~8.5–9pt italic",
    },
  },

  // Backward-compat `type` (runs.ts / finalArtifactGate read these).
  type: { bodyPt: 11.5, captionPt: 9, listPt: 11, lineHeight: 1.38, headingPt: 15, displayPt: 23 },

  // Column / measure rules.
  columns: {
    count: 12,
    gutterPx: 4,
    maxMeasureChars: 66,
    minMeasureChars: 44,
  },

  readable: true,
};

export function inchesToCssPx(inches: number): number {
  return Math.round(inches * PRINT_DPI * 100) / 100;
}

/**
 * CSS declarations for the contract. renderHtml.ts inlines this into the
 * `.render-contract` rule so the contract is VISIBLE in the rendered output
 * (verifiable via pdffonts / CSS inspection on the produced PDF).
 */
export function contractCss(contract: RenderContract): string {
  const m = contract.marginsIn;
  return `width:${contract.page.widthIn}in;height:${contract.page.heightIn}in;padding:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;`;
}

/**
 * Per-role CSS declarations, emitted into the `.render-contract` block so
 * every role is driven by the contract (not by hardcoded point sizes).
 */
export function contractRoleCss(contract: RenderContract): string {
  const r = contract.roles;
  return [
    `:root {`,
    `--role-display-font:${r.display.fontStack}; --role-display-pt:${r.display.pt}pt; --role-display-weight:${r.display.weight}; --role-display-lh:${r.display.lineHeight};`,
    `--role-heading-font:${r.heading.fontStack}; --role-heading-pt:${r.heading.pt}pt; --role-heading-weight:${r.heading.weight}; --role-heading-lh:${r.heading.lineHeight};`,
    `--role-body-font:${r.body.fontStack}; --role-body-pt:${r.body.pt}pt; --role-body-weight:${r.body.weight}; --role-body-lh:${r.body.lineHeight};`,
    `--role-list-font:${r.list.fontStack}; --role-list-pt:${r.list.pt}pt; --role-list-weight:${r.list.weight}; --role-list-lh:${r.list.lineHeight};`,
    `--role-caption-font:${r.caption.fontStack}; --role-caption-pt:${r.caption.pt}pt; --role-caption-weight:${r.caption.weight}; --role-caption-lh:${r.caption.lineHeight};`,
    `}`,
    `.render-contract .masthead h1, .render-contract .display { font-family: var(--role-display-font); font-weight: var(--role-display-weight); font-size: var(--role-display-pt); line-height: var(--role-display-lh); }`,
    `.render-contract .section-heading { font-family: var(--role-heading-font); font-weight: var(--role-heading-weight); font-size: var(--role-heading-pt); line-height: var(--role-heading-lh); }`,
    `.render-contract .script-heading { font-family: var(--role-heading-font); font-weight: var(--role-heading-weight); font-size: calc(var(--role-heading-pt) * 1.2); line-height: 1.04; }`,
    `.render-contract .body { font-family: var(--role-body-font); font-weight: var(--role-body-weight); font-size: var(--role-body-pt); line-height: var(--role-body-lh); }`,
    `.render-contract .list-body { font-family: var(--role-list-font); font-weight: var(--role-list-weight); font-size: var(--role-list-pt); line-height: var(--role-list-lh); }`,
    `.render-contract .photo figcaption { font-family: var(--role-caption-font); font-weight: var(--role-caption-weight); font-size: var(--role-caption-pt); line-height: var(--role-caption-lh); }`,
  ].join("\n");
}
