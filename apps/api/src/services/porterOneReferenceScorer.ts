import type {
  AssembledLayout,
  GridSpec,
  LayoutBlock,
} from "@newsforge/shared/schemas";

interface ReferenceFingerprint {
  id: string;
  photoArea: [number, number];
  colorPanelArea: [number, number];
  darkAccentArea: [number, number];
  imageBlocks: [number, number];
  contentBlocks: [number, number];
  narrowRails: [number, number];
  largestBlockArea: [number, number];
  bottomBandArea: [number, number];
}

export interface PorterOneReferenceScore {
  affinity: number;
  referenceId: string;
  diagnostics: {
    photoAreaRatio: number;
    colorPanelAreaRatio: number;
    darkAccentAreaRatio: number;
    imageBlockCount: number;
    contentBlockCount: number;
    narrowRailCount: number;
    largestBlockRatio: number;
    bottomBandAreaRatio: number;
  };
}

const PORTER_ONE_REFERENCES: ReferenceFingerprint[] = [
  {
    id: "example1-gateway-collage",
    photoArea: [0.18, 0.32],
    colorPanelArea: [0.42, 0.68],
    darkAccentArea: [0.02, 0.1],
    imageBlocks: [6, 11],
    contentBlocks: [11, 20],
    narrowRails: [2, 6],
    largestBlockArea: [0.12, 0.24],
    bottomBandArea: [0.08, 0.28],
  },
  {
    id: "example2-photo-rails",
    photoArea: [0.18, 0.34],
    colorPanelArea: [0.48, 0.72],
    darkAccentArea: [0.03, 0.12],
    imageBlocks: [5, 9],
    contentBlocks: [12, 22],
    narrowRails: [3, 7],
    largestBlockArea: [0.09, 0.2],
    bottomBandArea: [0.06, 0.22],
  },
  {
    id: "example3-dense-lavender-grid",
    photoArea: [0.14, 0.28],
    colorPanelArea: [0.52, 0.76],
    darkAccentArea: [0.015, 0.08],
    imageBlocks: [5, 10],
    contentBlocks: [12, 24],
    narrowRails: [3, 8],
    largestBlockArea: [0.08, 0.18],
    bottomBandArea: [0.08, 0.26],
  },
  {
    id: "example4-editorial-rail",
    photoArea: [0.08, 0.22],
    colorPanelArea: [0.38, 0.64],
    darkAccentArea: [0.03, 0.13],
    imageBlocks: [2, 6],
    contentBlocks: [10, 20],
    narrowRails: [2, 7],
    largestBlockArea: [0.08, 0.2],
    bottomBandArea: [0.04, 0.2],
  },
  {
    id: "example5-feature-band",
    photoArea: [0.14, 0.3],
    colorPanelArea: [0.5, 0.74],
    darkAccentArea: [0.04, 0.14],
    imageBlocks: [5, 10],
    contentBlocks: [12, 22],
    narrowRails: [2, 7],
    largestBlockArea: [0.12, 0.24],
    bottomBandArea: [0.08, 0.28],
  },
];

function area(block: LayoutBlock): number {
  return block.position.colSpan * block.position.rowSpan;
}

function closeness(value: number, [min, max]: [number, number]): number {
  if (value >= min && value <= max) return 1;
  const target = value < min ? min : max;
  const tolerance = Math.max(0.04, (max - min) * 0.75);
  return Math.max(0, 1 - Math.abs(value - target) / tolerance);
}

function tokenIsColored(block: LayoutBlock): boolean {
  const bg = block.style?.bg;
  return Boolean(bg && bg !== "paper" && bg !== "cream");
}

function tokenIsDark(block: LayoutBlock): boolean {
  return block.style?.bg === "navy" || block.style?.invertText === true;
}

function bottomBandArea(blocks: LayoutBlock[], gridSpec: GridSpec): number {
  const bottomStart = Math.max(1, gridSpec.rowsPerPage - 3);
  return blocks
    .filter((block) => block.position.row + block.position.rowSpan - 1 >= bottomStart)
    .filter((block) => block.position.colSpan >= Math.ceil(gridSpec.columns * 0.25))
    .reduce((sum, block) => sum + area(block), 0);
}

function narrowRailCount(blocks: LayoutBlock[], gridSpec: GridSpec): number {
  return blocks.filter((block) => {
    const colRatio = block.position.colSpan / gridSpec.columns;
    const rowRatio = block.position.rowSpan / gridSpec.rowsPerPage;
    return colRatio <= 0.28 && rowRatio >= 0.25;
  }).length;
}

function scoreReference(
  diagnostics: PorterOneReferenceScore["diagnostics"],
  reference: ReferenceFingerprint,
): number {
  return (
    closeness(diagnostics.photoAreaRatio, reference.photoArea) * 0.18 +
    closeness(diagnostics.colorPanelAreaRatio, reference.colorPanelArea) * 0.18 +
    closeness(diagnostics.darkAccentAreaRatio, reference.darkAccentArea) * 0.1 +
    closeness(diagnostics.imageBlockCount, reference.imageBlocks) * 0.14 +
    closeness(diagnostics.contentBlockCount, reference.contentBlocks) * 0.14 +
    closeness(diagnostics.narrowRailCount, reference.narrowRails) * 0.1 +
    closeness(diagnostics.largestBlockRatio, reference.largestBlockArea) * 0.08 +
    closeness(diagnostics.bottomBandAreaRatio, reference.bottomBandArea) * 0.08
  );
}

export function scorePorterOneReferenceAffinity(
  layout: AssembledLayout,
  gridSpec: GridSpec,
): PorterOneReferenceScore {
  const contentBlocks = layout.blocks.filter(
    (block) => block.kind !== "empty" && (block.articleId || block.imageId || block.kind === "list"),
  );
  const totalArea = Math.max(1, gridSpec.columns * gridSpec.rowsPerPage * layout.pageCount);
  const imageBlocks = contentBlocks.filter((block) => block.imageId);
  const photoArea = imageBlocks.reduce((sum, block) => sum + area(block), 0);
  const colorPanelArea = contentBlocks
    .filter(tokenIsColored)
    .reduce((sum, block) => sum + area(block), 0);
  const darkAccentArea = contentBlocks
    .filter(tokenIsDark)
    .reduce((sum, block) => sum + area(block), 0);
  const largestBlock = Math.max(0, ...contentBlocks.map(area));
  const diagnostics: PorterOneReferenceScore["diagnostics"] = {
    photoAreaRatio: photoArea / totalArea,
    colorPanelAreaRatio: colorPanelArea / totalArea,
    darkAccentAreaRatio: darkAccentArea / totalArea,
    imageBlockCount: imageBlocks.length,
    contentBlockCount: contentBlocks.length,
    narrowRailCount: narrowRailCount(contentBlocks, gridSpec),
    largestBlockRatio: largestBlock / totalArea,
    bottomBandAreaRatio: bottomBandArea(contentBlocks, gridSpec) / totalArea,
  };
  const scored = PORTER_ONE_REFERENCES
    .map((reference) => ({
      reference,
      score: scoreReference(diagnostics, reference),
    }))
    .sort((a, b) => b.score - a.score || a.reference.id.localeCompare(b.reference.id));
  const best = scored[0];
  return {
    affinity: Math.max(0, Math.min(1, best?.score ?? 0)),
    referenceId: best?.reference.id ?? "unknown",
    diagnostics,
  };
}
