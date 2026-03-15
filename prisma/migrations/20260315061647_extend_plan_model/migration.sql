-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annualDeductible" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coverageDetails" JSONB,
ADD COLUMN     "drugCoverage" JSONB,
ADD COLUMN     "eligibility" JSONB,
ADD COLUMN     "erCopay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "outOfPocketMax" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rawData" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'private';

-- CreateIndex
CREATE INDEX "plans_source_idx" ON "plans"("source");

-- CreateIndex
CREATE INDEX "plans_type_idx" ON "plans"("type");
