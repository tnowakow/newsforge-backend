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
  // Sparse input is allowed to run a lighter module count; 12 was a hard
  // floor that penalized legitimate sparse spreads. The 8-18 band is the
  // shared floor/ceiling for the dense families; the sparse family
  // (editorial-light) is scored against its own narrower band below.
  minModules: 8,
  maxModules: 18,
  sparseMinModules: 4,
  sparseMaxModules: 9,
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
- Module count is a band, not a mandate: dense families target 12-18 modules, sparse families (editorial-light, long-copy feature-band) may run as few as 4-9. 5-12 photos when supplied, and no block above 24% of a page.
- Keep every content box at least 80% filled. If copy is short, shrink the box or grow an adjacent photo; never leave a tall colored slab with a few lines.
- Birthday rails and director headshots are OPTIONAL modules: include them only when the supplied articles actually carry a birthday roster or a director letter. A sparse layout that omits both is valid; never pad a thin issue by forcing either.
- Dated lists remain narrow rails with subtle high-contrast panels: Happy Hour uses a sky panel with navy heading, Upcoming Events uses a cream panel with coral heading. Never use sun/yellow-green as schedule heading text, and never use paper/cream text on light panels.
- Every page needs a footer band, full-height rail, or photo mosaic anchor. Use purposeful color on mostly paper background.
`;
