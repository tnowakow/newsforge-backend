-- NewsForge v2 additive migration.
-- Vitaly rule 16: additive only. No drops, no renames, no non-null-without-default.
-- Ordering per V2-ARCHITECTURE.md §5.3:
--   1) enums
--   2) Client columns (Postgres backfills all 25 existing rows via defaults)
--   3) NewsletterRun columns (all nullable or defaulted)
--   4) index on NewsletterRun(approvalStatus)

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE "ArticleType" AS ENUM (
        'RESIDENT_STORY',
        'EVENT_RECAP',
        'ANNOUNCEMENT',
        'BIRTHDAY',
        'EXECUTIVE_NOTE',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ApprovalStatus" AS ENUM (
        'PENDING',
        'APPROVED',
        'CHANGES_REQUESTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Client additive columns (defaults backfill all 25 existing rows)
ALTER TABLE "Client"
    ADD COLUMN IF NOT EXISTS "bleedInches"      DOUBLE PRECISION NOT NULL DEFAULT 0.125,
    ADD COLUMN IF NOT EXISTS "safeAreaInches"   DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    ADD COLUMN IF NOT EXISTS "cropMarksEnabled" BOOLEAN          NOT NULL DEFAULT true;

-- 3. NewsletterRun additive columns.
-- IMPORTANT (Vitaly Phase 1 risk note to Marcus): declare the DEFAULT on
-- complianceFlags in the same ALTER as the column so Postgres backfills
-- correctly.
ALTER TABLE "NewsletterRun"
    ADD COLUMN IF NOT EXISTS "approvalStatus"      "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "approvalNotes"       TEXT,
    ADD COLUMN IF NOT EXISTS "approvedAt"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "approvedBy"          TEXT,
    ADD COLUMN IF NOT EXISTS "printPdfPath"        TEXT,
    ADD COLUMN IF NOT EXISTS "printPdfGeneratedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "layoutFitReport"     JSONB,
    ADD COLUMN IF NOT EXISTS "complianceFlags"     JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "bundleZipPath"       TEXT,
    ADD COLUMN IF NOT EXISTS "bundleBuiltAt"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "bundleLayoutVersion" INTEGER;

-- 4. Index on approvalStatus (fast list of approved runs for Maya's tab).
CREATE INDEX IF NOT EXISTS "NewsletterRun_approvalStatus_idx"
    ON "NewsletterRun"("approvalStatus");
