import 'server-only'

import { prisma } from '@/lib/prisma'
import { generateStructuredObject } from '@/lib/llm-client'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryScores = {
  hospital: number
  prescriptionDrugs: number
  dental: number
  vision: number
  mentalHealth: number
  emergency: number
}

export type CoverageScoreResult = {
  overallScore: number
  categories: CategoryScores
  planId: string | null
  planName: string | null
  rationale: string
}

// Category weights — sum to 1.0
const WEIGHTS: Record<keyof CategoryScores, number> = {
  hospital: 0.25,
  prescriptionDrugs: 0.25,
  dental: 0.10,
  vision: 0.05,
  mentalHealth: 0.20,
  emergency: 0.15,
}

// ---------------------------------------------------------------------------
// Schema for LLM response
// ---------------------------------------------------------------------------

const scoringSchema = z.object({
  hospital: z.number().int().min(0).max(100),
  prescriptionDrugs: z.number().int().min(0).max(100),
  dental: z.number().int().min(0).max(100),
  vision: z.number().int().min(0).max(100),
  mentalHealth: z.number().int().min(0).max(100),
  emergency: z.number().int().min(0).max(100),
  rationale: z.string(),
})

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function computeCoverageScore(
  userId: string,
): Promise<CoverageScoreResult> {
  // 1. Load user's medical profile
  const medicalProfile = await prisma.medicalProfile.findUnique({
    where: { userId },
  })

  if (!medicalProfile) {
    throw new Error('No medical profile found for this user.')
  }

  // 2. Find best plan — prefer extracted plans with ML features, fall back to
  //    most recently persisted CMS plan
  const bestPlan = await findBestPlan(userId)

  // 3. Build LLM prompt with medical + plan context
  const conditions = asArray(medicalProfile.conditions)
  const medications = asArray(medicalProfile.medications)
  const allergies = asArray(medicalProfile.allergies)
  const surgeries = asArray(medicalProfile.surgeries)
  const familyHistory = asArray(medicalProfile.familyHistory)
  const riskFactors = asArray(medicalProfile.riskFactors)

  const medicalSummary = [
    conditions.length
      ? `Conditions: ${conditions.map(itemName).join(', ')}`
      : 'No diagnosed conditions.',
    medications.length
      ? `Medications: ${medications.map(itemName).join(', ')}`
      : 'No current medications.',
    allergies.length
      ? `Allergies: ${allergies.map(itemName).join(', ')}`
      : 'No known allergies.',
    surgeries.length
      ? `Surgical history: ${surgeries.map(itemName).join(', ')}`
      : 'No surgical history.',
    familyHistory.length
      ? `Family history: ${familyHistory.map(itemName).join(', ')}`
      : 'No family history noted.',
    riskFactors.length
      ? `Risk factors: ${riskFactors.map(itemName).join(', ')}`
      : 'No risk factors noted.',
  ].join('\n')

  const planSummary = bestPlan
    ? [
        `Plan: ${bestPlan.name} (${bestPlan.carrier})`,
        `Type: ${bestPlan.planType}, Tier: ${bestPlan.metalTier}`,
        `Premium: $${bestPlan.monthlyPremium}/mo, Deductible: $${bestPlan.deductible}`,
        `Max OOP: $${bestPlan.maxOutOfPocket}`,
        bestPlan.coverageDetails
          ? `Coverage details: ${JSON.stringify(bestPlan.coverageDetails)}`
          : '',
        bestPlan.drugCoverage
          ? `Drug coverage: ${JSON.stringify(bestPlan.drugCoverage)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No plan on file. Score based on general market availability for this medical profile.'

  // 4. Ask LLM to score
  const scores = await generateStructuredObject({
    schema: scoringSchema,
    system: `You are a health coverage analyst. Given a patient's medical profile and their insurance plan details, score how well the plan covers them in each of 6 categories on a scale of 0–100.

Scoring guide:
- 90–100: Excellent — the plan covers this category comprehensively for this patient's specific needs
- 70–89: Good — solid coverage with minor gaps
- 40–69: Partial — significant gaps or high out-of-pocket for this patient
- 0–39: Poor — major coverage gaps that could leave this patient exposed

Be specific to THIS patient's conditions and medications. A plan that covers hospital well for a healthy person may score lower for someone with chronic conditions requiring frequent hospitalizations.

Return JSON with exactly these fields: hospital, prescriptionDrugs, dental, vision, mentalHealth, emergency (all integers 0-100), and rationale (a 2-3 sentence explanation of the overall coverage quality).`,
    prompt: `Patient medical profile:
${medicalSummary}

Insurance plan:
${planSummary}

Score this patient's coverage in each category.`,
  })

  // 5. Compute weighted average
  const overallScore = Math.round(
    Object.entries(WEIGHTS).reduce(
      (sum, [key, weight]) => sum + scores[key as keyof CategoryScores] * weight,
      0,
    ),
  )

  // 6. Persist to database
  await prisma.coverageScore.create({
    data: {
      userId,
      planId: bestPlan?.id ?? null,
      overallScore,
      hospital: scores.hospital,
      prescriptionDrugs: scores.prescriptionDrugs,
      dental: scores.dental,
      vision: scores.vision,
      mentalHealth: scores.mentalHealth,
      emergency: scores.emergency,
      rationale: scores.rationale,
    },
  })

  return {
    overallScore,
    categories: {
      hospital: scores.hospital,
      prescriptionDrugs: scores.prescriptionDrugs,
      dental: scores.dental,
      vision: scores.vision,
      mentalHealth: scores.mentalHealth,
      emergency: scores.emergency,
    },
    planId: bestPlan?.id ?? null,
    planName: bestPlan?.name ?? null,
    rationale: scores.rationale,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PlanRecord = {
  id: string
  name: string
  carrier: string
  planType: string
  metalTier: string
  monthlyPremium: number
  deductible: number
  maxOutOfPocket: number
  coverageDetails: unknown
  drugCoverage: unknown
}

async function findBestPlan(userId: string): Promise<PlanRecord | null> {
  // Check if user has a profile with province to narrow plans
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { province: true },
  })

  // Try extracted plans first (richer coverage data)
  const extractedPlan = await prisma.extractedPlan.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  if (extractedPlan) {
    const data = extractedPlan.extractedData as Record<string, unknown>
    const ml = extractedPlan.mlFeatures as Record<string, unknown>
    return {
      id: extractedPlan.id,
      name: extractedPlan.planName,
      carrier: extractedPlan.carrier,
      planType: extractedPlan.planType,
      metalTier: (ml?.planType as string) ?? 'unknown',
      monthlyPremium: (ml?.monthlyPremiumEstimate as number) ?? 0,
      deductible: (ml?.deductible as number) ?? 0,
      maxOutOfPocket: (ml?.maxOutOfPocket as number) ?? 0,
      coverageDetails: data?.benefits ?? null,
      drugCoverage: null,
    }
  }

  // Fall back to CMS plans — prefer plans in user's state
  const plan = await prisma.plan.findFirst({
    where: profile?.province
      ? { state: profile.province }
      : undefined,
    orderBy: { updatedAt: 'desc' },
  })

  if (plan) {
    return {
      id: plan.id,
      name: plan.name,
      carrier: plan.carrier,
      planType: plan.planType,
      metalTier: plan.metalTier,
      monthlyPremium: plan.monthlyPremium,
      deductible: plan.deductible,
      maxOutOfPocket: plan.maxOutOfPocket,
      coverageDetails: plan.coverageDetails,
      drugCoverage: plan.drugCoverage,
    }
  }

  return null
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return []
}

function itemName(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>
    return String(obj.name ?? obj.rawText ?? obj.condition ?? obj.factor ?? obj.substance ?? 'unknown')
  }
  return 'unknown'
}
