-- CreateTable
CREATE TABLE "extracted_plans" (
    "id" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "mlFeatures" JSONB NOT NULL,
    "extractionConfidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "medications" JSONB NOT NULL,
    "allergies" JSONB NOT NULL,
    "surgeries" JSONB NOT NULL,
    "familyHistory" JSONB NOT NULL,
    "immunizations" JSONB NOT NULL,
    "labResults" JSONB NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "rawDocumentIds" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "extracted_plans_sourceFile_key" ON "extracted_plans"("sourceFile");

-- CreateIndex
CREATE INDEX "extracted_plans_planType_jurisdiction_idx" ON "extracted_plans"("planType", "jurisdiction");

-- CreateIndex
CREATE INDEX "extracted_plans_carrier_idx" ON "extracted_plans"("carrier");

-- CreateIndex
CREATE UNIQUE INDEX "medical_profiles_userId_key" ON "medical_profiles"("userId");

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
