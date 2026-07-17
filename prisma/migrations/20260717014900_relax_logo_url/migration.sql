-- Relax Client.logoUrl NOT NULL to nullable.
-- Rationale: schema.prisma declares `logoUrl String?` but the 0_init
-- migration created the column as NOT NULL. This aligns the DB with
-- the declared Prisma model so seed can pass null for clients that
-- don't ship an inline logo.

ALTER TABLE "Client" ALTER COLUMN "logoUrl" DROP NOT NULL;
