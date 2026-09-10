/**
 * TRI-R05 — subject-safe crop choices joint with layout frame aspect.
 *
 * Low-resolution acceptance stays in assessPrintDpi; this module only
 * decides cover/contain + focal bounds so people and primary content stay
 * visible. If a cover crop would clip subject bounds, prefer contain or a
 * wider/taller frame alternative.
 */
import type {
  CropAlternative,
  NewsImage,
  SubjectBounds,
} from "@newsforge/shared/schemas";

export type FrameSpec = {
  /** Frame width / height. Portrait rails are < 1; wide bands are > 1. */
  aspectRatio: number;
  /** Optional layout role label for diagnostics. */
  label?: string;
};

export type SubjectSafeCrop = {
  fitMode: "cover" | "contain";
  focalX: number;
  focalY: number;
  zoom: number;
  clipsSubject: boolean;
  reason: string;
  alternatives: CropAlternative[];
  /** Suggested alternate frame aspects when the requested frame is unsafe. */
  saferFrameAspects: number[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function boundsOrDefault(image: NewsImage): SubjectBounds {
  const b = image.contentAnalysis?.subjectBounds;
  if (b && b.right > b.left && b.bottom > b.top) return b;
  // Unknown subject: assume a generous center region rather than a tight crop.
  return { left: 10, top: 10, right: 90, bottom: 90 };
}

function subjectAspect(b: SubjectBounds): number {
  const w = Math.max(1, b.right - b.left);
  const h = Math.max(1, b.bottom - b.top);
  return w / h;
}

/**
 * Does a cover crop of `frameAspect` centered on focal keep the full subject box?
 * Cover scales the image until both axes fill the frame, then crops overflow.
 */
export function coverClipsSubject(
  imageAspect: number,
  frameAspect: number,
  bounds: SubjectBounds,
  focalX = 50,
  focalY = 50,
): boolean {
  // Normalize: place image in a unit square frame via cover.
  // Image size in frame-space before crop:
  let imgW: number;
  let imgH: number;
  if (imageAspect > frameAspect) {
    // Image is relatively wider — height fills, width overflows.
    imgH = 1;
    imgW = imageAspect / frameAspect;
  } else {
    imgW = 1;
    imgH = frameAspect / imageAspect;
  }
  const focusX = clamp(focalX, 0, 100) / 100;
  const focusY = clamp(focalY, 0, 100) / 100;
  // Position image so focal point sits at frame center when possible.
  let originX = 0.5 - focusX * imgW;
  let originY = 0.5 - focusY * imgH;
  originX = clamp(originX, 1 - imgW, 0);
  originY = clamp(originY, 1 - imgH, 0);

  const left = bounds.left / 100;
  const right = bounds.right / 100;
  const top = bounds.top / 100;
  const bottom = bounds.bottom / 100;
  const subL = originX + left * imgW;
  const subR = originX + right * imgW;
  const subT = originY + top * imgH;
  const subB = originY + bottom * imgH;
  const eps = 0.02;
  return subL < -eps || subR > 1 + eps || subT < -eps || subB > 1 + eps;
}

function imageAspectRatio(image: NewsImage): number {
  if (image.width && image.height && image.height > 0) return image.width / image.height;
  if (image.aspect === "portrait") return 3 / 4;
  if (image.aspect === "square") return 1;
  return 4 / 3;
}

/**
 * Choose fit/focal for a frame. Prefer cover when the subject fits; otherwise
 * contain. Always returns inspectable alternatives (cover, contain, safer frames).
 */
export function chooseSubjectSafeCrop(image: NewsImage, frame: FrameSpec): SubjectSafeCrop {
  const bounds = boundsOrDefault(image);
  const imgAspect = imageAspectRatio(image);
  const focalX = clamp((bounds.left + bounds.right) / 2, 0, 100);
  const focalY = clamp((bounds.top + bounds.bottom) / 2, 0, 100);
  const people = image.contentAnalysis?.peopleCount ?? 0;
  const wideSubject = subjectAspect(bounds) >= 1.35;
  const frameAspect = frame.aspectRatio > 0 ? frame.aspectRatio : 1;

  const coverClips = coverClipsSubject(imgAspect, frameAspect, bounds, focalX, focalY);
  // Narrow rails with multi-person / wide group photos are unsafe under cover.
  const narrowRail = frameAspect < 0.85;
  const multiPerson = people >= 3 || wideSubject;
  const forceContain = coverClips || (narrowRail && multiPerson);

  const coverAlt: CropAlternative = {
    label: "cover-subject-focus",
    fitMode: "cover",
    focalX,
    focalY,
    zoom: 1,
    clipsSubject: coverClips || (narrowRail && multiPerson),
    reason: coverClips
      ? "Cover crop clips subject bounds for this frame aspect"
      : narrowRail && multiPerson
        ? "Narrow rail would squeeze a multi-person/wide subject under cover"
        : "Cover keeps subject inside the frame at subject focal point",
  };
  const containAlt: CropAlternative = {
    label: "contain-full-subject",
    fitMode: "contain",
    focalX,
    focalY,
    zoom: 1,
    clipsSubject: false,
    reason: "Contain preserves the full subject box; may letterbox",
  };

  const saferFrameAspects: number[] = [];
  if (forceContain) {
    // Offer a frame closer to the subject aspect so cover becomes safe later.
    const target = clamp(subjectAspect(bounds), 0.7, 2.2);
    saferFrameAspects.push(Number(target.toFixed(3)));
    if (narrowRail) saferFrameAspects.push(1.4);
  }

  const alternatives = [forceContain ? containAlt : coverAlt, forceContain ? coverAlt : containAlt];

  if (forceContain) {
    return {
      fitMode: "contain",
      focalX,
      focalY,
      zoom: 1,
      clipsSubject: false,
      reason:
        people >= 2
          ? `Subject-safe contain: preserve ${people || "all"} people / primary content in ${frame.label ?? "frame"}`
          : `Subject-safe contain: cover would clip content in ${frame.label ?? "frame"}`,
      alternatives,
      saferFrameAspects,
    };
  }

  return {
    fitMode: "cover",
    focalX,
    focalY,
    zoom: 1,
    clipsSubject: false,
    reason: `Cover with subject focal point (${focalX.toFixed(0)}%, ${focalY.toFixed(0)}%)`,
    alternatives,
    saferFrameAspects,
  };
}

/** Apply the chosen crop onto a NewsImage copy. */
export function applySubjectSafeCrop(image: NewsImage, frame: FrameSpec): NewsImage {
  const choice = chooseSubjectSafeCrop(image, frame);
  return {
    ...image,
    fitMode: choice.fitMode,
    focalX: choice.focalX,
    focalY: choice.focalY,
    zoom: choice.zoom,
    cropAlternatives: choice.alternatives,
  };
}

/**
 * Approximate frame aspect from a 24×16 letter grid block.
 * colSpan/rowSpan map to physical proportions on an 8.5×11 page.
 */
export function frameAspectFromGrid(position: {
  colSpan: number;
  rowSpan: number;
  cols?: number;
  rows?: number;
}): number {
  const cols = position.cols ?? 24;
  const rows = position.rows ?? 16;
  const pageW = 8.5;
  const pageH = 11;
  const w = (position.colSpan / cols) * pageW;
  const h = (position.rowSpan / rows) * pageH;
  return h > 0 ? w / h : 1;
}
