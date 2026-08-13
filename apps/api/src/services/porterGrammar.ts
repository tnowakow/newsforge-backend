import type { PanelRole, PanelToken } from "@newsforge/shared/schemas";

export type PorterGrammarFamily =
  | "birthday-exec-rail"
  | "birthday-feature-band"
  | "photo-mosaic-rail"
  | "dense-lavender-grid"
  | "editorial-light"
  | "spotlight-feature";

export interface PorterRoleGrammar {
  bg?: PanelToken;
  headerColor?: PanelToken;
  scriptHeading?: boolean;
  narrowRail?: boolean;
}

export const PORTER_ROLE_GRAMMAR: Record<PanelRole, PorterRoleGrammar> = {
  birthday: { bg: "sun", headerColor: "coral", scriptHeading: true, narrowRail: true },
  directorCorner: { bg: "cream", headerColor: "navy", scriptHeading: true },
  happyHour: { bg: "sky", headerColor: "navy", narrowRail: true },
  upcomingEvents: { bg: "cream", headerColor: "coral", narrowRail: true },
  outingList: { headerColor: "navy", narrowRail: true },
  spotlightRail: { bg: "berry", headerColor: "navy" },
  featureBand: { bg: "sky", headerColor: "navy" },
  volunteerCallout: { bg: "leaf", headerColor: "navy" },
  infoFooter: { bg: "navy", headerColor: "paper" },
  photoCluster: { narrowRail: false },
};

export const PORTER_GRAMMAR_TARGETS = {
  familyCount: 6,
  minModules: 12,
  maxModules: 18,
  maxBlockAreaRatio: 0.24,
  minFillRatio: 0.8,
  photoBlocks: [5, 12] as [number, number],
  largestBlockIsNarrowRail: true,
  pageMustHaveAnchor: true,
};

export const PORTER_SCORER_RANGES = {
  contentBlocks: [11, 20] as [number, number],
  photos: [5, 11] as [number, number],
  narrowRails: [2, 7] as [number, number],
  largestBlock: [0.08, 0.24] as [number, number],
  bottomBand: [0.06, 0.28] as [number, number],
};

export const PORTER_GRAMMAR_PROMPT = `
PORTER GRAMMAR (six elastic families, not six rigid templates):
- Shared vocabulary: birthday sun rail, cream director corner with navy heading, narrow dated-list rails, berry/navy spotlight panels, colored feature panels, navy info footer, and tight photo clusters.
- Choose among birthday-exec-rail, birthday-feature-band, photo-mosaic-rail, dense-lavender-grid, editorial-light, and spotlight-feature according to content volume.
- Target 12–18 meaningful modules across the inner spread, 5–12 photos when supplied, and no block above 24% of a page.
- Keep every content box at least 80% filled. If copy is short, shrink the box or grow an adjacent photo; never leave a tall colored slab with a few lines.
- Birthday rails grow toward full height when the list is long. Director headshots are elastic: keep them only when the adjacent copy still fits; otherwise preserve the image exactly once in a nearby photo slot.
- Dated lists remain narrow rails with subtle high-contrast panels: Happy Hour uses a sky panel with navy heading, Upcoming Events uses a cream panel with coral heading. Never use sun/yellow-green as schedule heading text, and never use paper/cream text on light panels.
- Every page needs a footer band, full-height rail, or photo mosaic anchor. Use purposeful color on mostly paper background.
`;
