import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateExplanation } from '@/lib/ml/explanation-engine'
import type { UserProfile } from '@/lib/profile'

export const runtime = 'nodejs'
export const maxDuration = 120

const profileSchema = z.object({
  province: z.string(),
  immigrationStatus: z.enum([
    'citizen', 'permanent_resident', 'work_permit', 'student_visa',
    'refugee', 'asylum_seeker', 'undocumented', 'unknown',
  ]),
  residencyStartDate: z.string().default('unknown'),
  ageBand: z.enum(['0-17', '18-25', '26-35', '36-45', '46-55', '56-64', '65+']),
  employmentStatus: z.enum(['student', 'employed', 'self_employed', 'unemployed', 'retiree']),
  hasEmployerBenefits: z.enum(['yes', 'no', 'unknown']),
  dependants: z.object({ spouse: z.boolean(), children: z.number().int().min(0) }),
  incomeBand: z.enum(['low', 'medium', 'high', 'prefer_not_to_say']),
  specialCategory: z.enum(['refugee', 'temp_foreign_worker', 'intl_student', 'asylum_seeker']).nullable(),
  language: z.string().default('en'),
})

const medicalFeaturesSchema = z.object({
  counts: z.object({
    conditionCount: z.number(),
    chronicConditionCount: z.number(),
    medicationCount: z.number(),
    surgeryCount: z.number(),
    allergyCount: z.number(),
    abnormalLabCount: z.number(),
  }),
  conditionFlags: z.object({
    hasCardiometabolicDisease: z.boolean(),
    hasRespiratoryDisease: z.boolean(),
    hasMentalHealthCondition: z.boolean(),
    hasCancerHistory: z.boolean(),
    hasAutoimmuneDisease: z.boolean(),
    hasKidneyDisease: z.boolean(),
    hasLiverDisease: z.boolean(),
    hasNeurologicDisease: z.boolean(),
  }),
  medicationFlags: z.object({
    hasPolypharmacy: z.boolean(),
    hasInsulinOrGlucoseLoweringTherapy: z.boolean(),
    hasAnticoagulant: z.boolean(),
    hasImmunosuppressant: z.boolean(),
    hasControlledMedication: z.boolean(),
  }),
  utilizationFlags: z.object({
    recentHospitalization: z.boolean(),
    recentEmergencyCare: z.boolean(),
    needsNearTermFollowUp: z.boolean(),
  }),
  derivedIndicators: z.object({
    overallClinicalRisk: z.enum(['low', 'moderate', 'high', 'very_high']),
    followUpUrgency: z.enum(['routine', 'soon', 'urgent']),
    evidenceCompleteness: z.enum(['limited', 'moderate', 'rich']),
  }),
}).optional()

const requestSchema = z.object({
  profile: profileSchema,
  medicalFeatures: medicalFeaturesSchema,
})

/**
 * POST /api/ml/explain
 *
 * Generates LLM-powered explanations of ML decision tree recommendations.
 * Returns rich per-plan explanations, narrative summary, and visualization data
 * (radar charts, score comparisons, probability distributions, feature importances,
 * cost comparisons, and decision path narratives).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const profile = parsed.data.profile as UserProfile
    const medicalFeatures = (parsed.data.medicalFeatures as import('@/lib/medical-feature-pipeline').MedicalMlFeatures | undefined) ?? null

    const result = await generateExplanation(profile, medicalFeatures)

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Explanation generation failed.'
    console.error('[ml/explain] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
