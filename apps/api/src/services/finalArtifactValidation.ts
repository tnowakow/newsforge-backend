import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";
import {
  ArticlesSchema,
  AssembledLayoutSchema,
  GridSpecSchema,
  ImagesSchema,
  RecurringSectionsSchema,
} from "@newsforge/shared/schemas";
import { prisma } from "../db.js";
import {
  digestFinalArtifact,
  evaluateFinalArtifactGate,
  finalArtifactReportDigest,
  type FinalArtifactGateReport,
} from "./finalArtifactGate.js";
import { measureFinalLayout } from "./layoutMeasurementService.js";
import {
  expectedPdfPageCount,
  generatePdfForRun,
  inspectPdfArtifact,
  type PdfGenerationResult,
  type PdfVariant,
} from "./pdf.js";

export interface ValidatedPdfArtifact {
  pdf: PdfGenerationResult;
  gate: FinalArtifactGateReport;
  measurementError?: string;
  inspectionError?: string;
}

export async function validateFinalPdfArtifact(
  runId: string,
  variant: PdfVariant,
): Promise<ValidatedPdfArtifact> {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    include: { client: true, template: true },
  });
  if (!run) throw new Error("run_not_found");

  const layout = AssembledLayoutSchema.parse(run.assembledLayout);
  const articles = ArticlesSchema.parse(run.articles);
  const images = ImagesSchema.parse(run.images);
  const gridSpec = GridSpecSchema.parse(run.template.gridSpec);
  const recurring = RecurringSectionsSchema.safeParse(run.client.recurringSections);
  const pdf = await generatePdfForRun(runId, variant);

  const measurementResult = await measureFinalLayout({
    clientName: run.client.name,
    monthLabel: run.monthLabel,
    brandKit: {
      primaryColor: run.client.primaryColor,
      secondaryColor: run.client.secondaryColor,
      accentColor: run.client.accentColor,
      headingFont: run.client.headingFont,
      bodyFont: run.client.bodyFont,
      logoUrl: run.client.logoUrl,
    },
    gridSpec,
    articles,
    images,
    recurringSections: recurring.success ? recurring.data : [],
    layout,
    variant,
  });

  let inspection: Awaited<ReturnType<typeof inspectPdfArtifact>> | undefined;
  let inspectionError: string | undefined;
  try {
    inspection = await inspectPdfArtifact(
      pdf.pdfPath,
      LETTER_RENDER_CONTRACT.fontAvailability.required,
    );
  } catch (error) {
    inspectionError = error instanceof Error ? error.message : String(error);
  }

  const priorReport = (run.layoutFitReport ?? {}) as Record<string, unknown>;
  const invariants = priorReport.porterLayoutInvariants as {
    hardFailures?: string[];
    warnings?: string[];
  } | undefined;
  const contentDigest = digestFinalArtifact({
    layout,
    layoutVersion: run.layoutVersion,
    articles,
    images,
    sourceAssetContract: run.sourceAssetContract,
  });
  const renderContractDigest = digestFinalArtifact({
    contract: LETTER_RENDER_CONTRACT,
    exportVariant: variant,
  });
  const binding = {
    contentDigest,
    renderContractDigest,
    artifactDigest: inspection?.outputHash,
    exportVariant: variant,
    layoutVersion: run.layoutVersion,
  };
  const measurement = measurementResult.status === "passed"
    ? measurementResult.measurement
    : undefined;
  const gate = evaluateFinalArtifactGate({
    sourceComplete: Boolean(invariants) && !(invariants?.hardFailures ?? []).some((failure) =>
      /^(source-|source-packet)/.test(failure),
    ),
    requiredLinksResolved: Boolean(invariants) && !(invariants?.warnings ?? []).some((warning) =>
      warning.startsWith("source-photo-unresolved:"),
    ),
    actualPageCount: inspection?.actualPageCount ?? 0,
    expectedPageCount: expectedPdfPageCount(layout.pageCount, variant),
    measurementStatus: inspection ? measurementResult.status : "unknown",
    measurement,
    minBodyFontPt: measurement?.minBodyFontPt,
    minCaptionFontPt: measurement?.minCaptionFontPt,
    requiredBodyFontPt: Math.min(
      LETTER_RENDER_CONTRACT.type.bodyPt,
      LETTER_RENDER_CONTRACT.type.listPt,
    ),
    requiredCaptionFontPt: layout.blocks.some((block) => Boolean(block.caption))
      ? LETTER_RENDER_CONTRACT.type.captionPt
      : undefined,
    missingEmbeddedFonts: inspection?.missingEmbeddedFonts,
    ...binding,
    reportDigest: finalArtifactReportDigest(binding),
    duplicateIssues: [],
  });

  await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      layoutFitReport: { ...priorReport, finalArtifactGate: gate } as unknown as object,
    },
  });

  return {
    pdf,
    gate,
    measurementError: measurementResult.status === "passed" ? undefined : measurementResult.error,
    inspectionError,
  };
}
