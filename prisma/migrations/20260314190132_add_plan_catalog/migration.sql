-- CreateEnum
CREATE TYPE "MetalTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('HMO', 'PPO', 'EPO');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "metalTier" "MetalTier" NOT NULL,
    "planType" "PlanType" NOT NULL,
    "monthlyPremium" INTEGER NOT NULL,
    "deductible" INTEGER NOT NULL,
    "maxOutOfPocket" INTEGER NOT NULL,
    "coinsuranceRate" INTEGER NOT NULL,
    "primaryCareCopay" INTEGER NOT NULL,
    "specialistCopay" INTEGER NOT NULL,
    "formulary" JSONB NOT NULL,
    "providerNetwork" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_planCode_key" ON "plans"("planCode");

-- CreateIndex
CREATE INDEX "plans_state_metalTier_idx" ON "plans"("state", "metalTier");

-- CreateIndex
CREATE INDEX "plans_carrier_state_idx" ON "plans"("carrier", "state");
