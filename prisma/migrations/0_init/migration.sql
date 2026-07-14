-- CreateEnum
CREATE TYPE "Richness" AS ENUM ('SIMPLE', 'MODERATE', 'RICH', 'EXTRA_RICH');

-- CreateEnum
CREATE TYPE "CareLevel" AS ENUM ('INDEPENDENT_LIVING', 'ASSISTED_LIVING', 'MEMORY_CARE', 'MIXED');

-- CreateEnum
CREATE TYPE "FillerMode" AS ENUM ('GENERATE', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('DRAFT', 'ASSEMBLING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'ARTICLE');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('MOCK', 'UPLOAD', 'GENERATED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "careLevel" "CareLevel" NOT NULL,
    "richnessLevel" "Richness" NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "headingFont" TEXT NOT NULL,
    "bodyFont" TEXT NOT NULL,
    "defaultTemplateId" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "recurringSections" JSONB NOT NULL,
    "brandVoice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "gridSpec" JSONB NOT NULL,
    "slotTypes" JSONB NOT NULL,
    "compatibilityHints" JSONB NOT NULL,
    "previewImageUrl" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterRun" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "fillerMode" "FillerMode" NOT NULL,
    "articles" JSONB NOT NULL,
    "images" JSONB NOT NULL,
    "assembledLayout" JSONB NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "pdfPath" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "layoutVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLibrary" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "type" "AssetType" NOT NULL,
    "contentOrUrl" TEXT NOT NULL,
    "source" "AssetSource" NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEdit" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "resultStatus" TEXT NOT NULL,
    "diffSummary" JSONB,
    "layoutBefore" JSONB NOT NULL,
    "layoutAfter" JSONB,
    "geminiLatency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_richnessLevel_idx" ON "Client"("richnessLevel");

-- CreateIndex
CREATE INDEX "NewsletterRun_clientId_createdAt_idx" ON "NewsletterRun"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetLibrary_clientId_type_idx" ON "AssetLibrary"("clientId", "type");

-- CreateIndex
CREATE INDEX "AssetLibrary_type_source_idx" ON "AssetLibrary"("type", "source");

-- CreateIndex
CREATE INDEX "AiEdit_runId_createdAt_idx" ON "AiEdit"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_defaultTemplateId_fkey" FOREIGN KEY ("defaultTemplateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterRun" ADD CONSTRAINT "NewsletterRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterRun" ADD CONSTRAINT "NewsletterRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLibrary" ADD CONSTRAINT "AssetLibrary_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEdit" ADD CONSTRAINT "AiEdit_runId_fkey" FOREIGN KEY ("runId") REFERENCES "NewsletterRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

