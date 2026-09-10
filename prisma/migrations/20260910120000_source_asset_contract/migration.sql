-- Add sourceAssetContract column to NewsletterRun.
-- Stores the canonical SourceAssetContract (shared zod schema) computed at
-- run creation from the per-unit photo reservation pass. This gives every
-- downstream consumer (layout planner, inner-spread composer, export) a
-- single, order-independent source of truth for which images are reserved
-- to which articles, and prevents a semantic/inferred assignment from
-- claiming a photo that a later article references by exact filename.
--
-- Additive / nullable: existing rows keep NULL. The column is only populated
-- for runs created from an uploaded Porter source packet.

ALTER TABLE "NewsletterRun" ADD COLUMN "sourceAssetContract" JSONB;
