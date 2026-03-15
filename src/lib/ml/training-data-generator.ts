import 'server-only'

import { z } from 'zod'
import { generateStructuredObject } from '@/lib/llm-client'
import type { FeatureVector, TrainingSample } from './decision-tree'

const trainingModel =
  process.env.MEDICAL_EXTRACTION_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b'

// ---------------------------------------------------------------------------
// Patient archetypes — diverse Canadian profiles for training data generation
// ---------------------------------------------------------------------------

type PatientArchetype = {
  id: string
  label: string
  profile: {
    province: string
    immigrationStatus: string
    ageBand: string
    employmentStatus: string
    hasEmployerBenefits: string
    incomeBand: string
    specialCategory: string | null
    hasDependants: boolean
  }
  medicalFeatures: Record<string, number | boolean>
}

const PATIENT_ARCHETYPES: PatientArchetype[] = [
  {
    id: 'healthy-young-citizen',
    label: 'Healthy young Canadian citizen',
    profile: {
      province: 'ON', immigrationStatus: 'citizen', ageBand: '18-25',
      employmentStatus: 'student', hasEmployerBenefits: 'no', incomeBand: 'low',
      specialCategory: null, hasDependants: false,
    },
    medicalFeatures: {
      age: 22, condition_count: 0, chronic_count: 0, medication_count: 0,
      surgery_count: 0, allergy_count: 1, clinical_risk: 0,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: false,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'chronic-middle-age',
    label: 'Middle-aged with chronic conditions',
    profile: {
      province: 'ON', immigrationStatus: 'citizen', ageBand: '46-55',
      employmentStatus: 'employed', hasEmployerBenefits: 'yes', incomeBand: 'medium',
      specialCategory: null, hasDependants: true,
    },
    medicalFeatures: {
      age: 50, condition_count: 3, chronic_count: 2, medication_count: 4,
      surgery_count: 1, allergy_count: 0, clinical_risk: 2,
      has_cardiometabolic: true, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: true,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'refugee-family',
    label: 'Refugee with family, new to Canada',
    profile: {
      province: 'ON', immigrationStatus: 'refugee', ageBand: '36-45',
      employmentStatus: 'unemployed', hasEmployerBenefits: 'no', incomeBand: 'low',
      specialCategory: 'refugee', hasDependants: true,
    },
    medicalFeatures: {
      age: 38, condition_count: 1, chronic_count: 0, medication_count: 1,
      surgery_count: 0, allergy_count: 0, clinical_risk: 1,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: true,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: true,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'intl-student',
    label: 'International student',
    profile: {
      province: 'ON', immigrationStatus: 'student_visa', ageBand: '18-25',
      employmentStatus: 'student', hasEmployerBenefits: 'no', incomeBand: 'low',
      specialCategory: 'intl_student', hasDependants: false,
    },
    medicalFeatures: {
      age: 21, condition_count: 0, chronic_count: 0, medication_count: 0,
      surgery_count: 0, allergy_count: 0, clinical_risk: 0,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: false,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'senior-citizen',
    label: 'Retired senior citizen',
    profile: {
      province: 'ON', immigrationStatus: 'citizen', ageBand: '65+',
      employmentStatus: 'retiree', hasEmployerBenefits: 'no', incomeBand: 'low',
      specialCategory: null, hasDependants: false,
    },
    medicalFeatures: {
      age: 70, condition_count: 4, chronic_count: 3, medication_count: 6,
      surgery_count: 2, allergy_count: 2, clinical_risk: 2,
      has_cardiometabolic: true, has_respiratory: true, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: true, needs_followup: true,
      recent_hospitalization: true, recent_emergency: false,
    },
  },
  {
    id: 'self-employed-pr',
    label: 'Self-employed permanent resident',
    profile: {
      province: 'BC', immigrationStatus: 'permanent_resident', ageBand: '36-45',
      employmentStatus: 'self_employed', hasEmployerBenefits: 'no', incomeBand: 'high',
      specialCategory: null, hasDependants: true,
    },
    medicalFeatures: {
      age: 40, condition_count: 1, chronic_count: 0, medication_count: 1,
      surgery_count: 0, allergy_count: 1, clinical_risk: 0,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: false,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'work-permit-worker',
    label: 'Temporary foreign worker on work permit',
    profile: {
      province: 'AB', immigrationStatus: 'work_permit', ageBand: '26-35',
      employmentStatus: 'employed', hasEmployerBenefits: 'unknown', incomeBand: 'medium',
      specialCategory: 'temp_foreign_worker', hasDependants: false,
    },
    medicalFeatures: {
      age: 30, condition_count: 0, chronic_count: 0, medication_count: 0,
      surgery_count: 0, allergy_count: 0, clinical_risk: 0,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: false,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'complex-medical',
    label: 'Patient with complex medical needs',
    profile: {
      province: 'QC', immigrationStatus: 'citizen', ageBand: '56-64',
      employmentStatus: 'employed', hasEmployerBenefits: 'yes', incomeBand: 'medium',
      specialCategory: null, hasDependants: true,
    },
    medicalFeatures: {
      age: 58, condition_count: 5, chronic_count: 3, medication_count: 7,
      surgery_count: 2, allergy_count: 3, clinical_risk: 3,
      has_cardiometabolic: true, has_respiratory: true, has_mental_health: true,
      has_cancer_history: true, has_polypharmacy: true, needs_followup: true,
      recent_hospitalization: true, recent_emergency: true,
    },
  },
  {
    id: 'asylum-seeker',
    label: 'Asylum seeker awaiting claim',
    profile: {
      province: 'ON', immigrationStatus: 'asylum_seeker', ageBand: '26-35',
      employmentStatus: 'unemployed', hasEmployerBenefits: 'no', incomeBand: 'low',
      specialCategory: 'asylum_seeker', hasDependants: true,
    },
    medicalFeatures: {
      age: 32, condition_count: 1, chronic_count: 0, medication_count: 0,
      surgery_count: 0, allergy_count: 0, clinical_risk: 1,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: true,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: true,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
  {
    id: 'young-family-employed',
    label: 'Young family with employer benefits',
    profile: {
      province: 'ON', immigrationStatus: 'permanent_resident', ageBand: '26-35',
      employmentStatus: 'employed', hasEmployerBenefits: 'yes', incomeBand: 'medium',
      specialCategory: null, hasDependants: true,
    },
    medicalFeatures: {
      age: 32, condition_count: 0, chronic_count: 0, medication_count: 1,
      surgery_count: 0, allergy_count: 0, clinical_risk: 0,
      has_cardiometabolic: false, has_respiratory: false, has_mental_health: false,
      has_cancer_history: false, has_polypharmacy: false, needs_followup: false,
      recent_hospitalization: false, recent_emergency: false,
    },
  },
]

// ---------------------------------------------------------------------------
// Combine patient + plan features into a single vector
// ---------------------------------------------------------------------------

export function combineFeaturesForClassifier(
  patientFeatures: Record<string, number | boolean>,
  planFeatures: Record<string, number | boolean | string>,
  profileFeatures: Record<string, number | boolean | string>,
): FeatureVector {
  const combined: FeatureVector = {}

  // Patient medical features (prefix: p_)
  for (const [key, value] of Object.entries(patientFeatures)) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      combined[`p_${key}`] = value
    }
  }

  // Plan features (prefix: plan_)
  for (const [key, value] of Object.entries(planFeatures)) {
    if (typeof value === 'number') {
      combined[`plan_${key}`] = value
    } else if (typeof value === 'boolean') {
      combined[`plan_${key}`] = value
    }
    // Skip string features — they need encoding below
  }

  // Encode categorical plan features as booleans
  if (typeof planFeatures.plan_type === 'string') {
    combined['plan_is_public'] = ['provincial_public', 'federal_public', 'dental_public', 'temporary_coverage'].includes(planFeatures.plan_type)
    combined['plan_is_private'] = ['private_individual', 'private_group'].includes(planFeatures.plan_type)
    combined['plan_is_federal'] = ['federal_public', 'federal_employee', 'temporary_coverage'].includes(planFeatures.plan_type)
  }

  if (typeof planFeatures.generosity === 'string') {
    const generosityMap: Record<string, number> = {
      minimal: 1, basic: 2, moderate: 3, comprehensive: 4, premium: 5,
    }
    combined['plan_generosity_score'] = generosityMap[planFeatures.generosity] ?? 3
  }

  // Profile features (prefix: prof_)
  const profileEncodings: Record<string, Record<string, number>> = {
    immigrationStatus: {
      citizen: 0, permanent_resident: 1, work_permit: 2, student_visa: 3,
      refugee: 4, asylum_seeker: 5, undocumented: 6, unknown: 7,
    },
    employmentStatus: {
      employed: 0, self_employed: 1, student: 2, unemployed: 3, retiree: 4,
    },
    incomeBand: {
      low: 0, medium: 1, high: 2, prefer_not_to_say: 1,
    },
    hasEmployerBenefits: {
      yes: 1, no: 0, unknown: 0,
    },
  }

  for (const [key, value] of Object.entries(profileFeatures)) {
    if (typeof value === 'boolean') {
      combined[`prof_${key}`] = value
    } else if (typeof value === 'number') {
      combined[`prof_${key}`] = value
    } else if (typeof value === 'string' && profileEncodings[key]) {
      combined[`prof_${key}_enc`] = profileEncodings[key][value] ?? 0
    }
  }

  // Interaction features — cross-product signals that help the tree
  combined['interaction_chronic_needs_drugs'] =
    (combined['p_chronic_count'] as number ?? 0) > 0 && (combined['plan_covers_drugs'] === true)
  combined['interaction_mental_health_covered'] =
    (combined['p_has_mental_health'] === true) && (combined['plan_covers_mental_health'] === true)
  combined['interaction_high_risk_comprehensive'] =
    (combined['p_clinical_risk'] as number ?? 0) >= 2 && (combined['plan_generosity_score'] as number ?? 0) >= 4
  combined['interaction_low_income_public'] =
    (combined['prof_incomeBand_enc'] as number ?? 1) === 0 && (combined['plan_is_public'] === true)
  combined['interaction_needs_specialist'] =
    (combined['p_condition_count'] as number ?? 0) >= 2 && (combined['plan_covers_specialist'] === true)

  return combined
}

// ---------------------------------------------------------------------------
// LLM-assisted training label generation
// ---------------------------------------------------------------------------

const labelSchema = z.object({
  ratings: z.array(z.object({
    planId: z.string(),
    matchLabel: z.enum(['excellent', 'good', 'fair', 'poor']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
})

export type PlanSummaryForLabeling = {
  planId: string
  planName: string
  planType: string
  carrier: string
  jurisdiction: string
  summary: string
  coveredBenefits: string[]
  monthlyPremium: number
  deductible: number
  coinsuranceDefault: number
  exclusionCount: number
  generosity: string
}

/**
 * Ask the LLM to rate how well each plan matches a patient archetype.
 * Returns labeled training samples with combined feature vectors.
 */
export async function generateTrainingLabels(
  archetype: PatientArchetype,
  plans: PlanSummaryForLabeling[],
  planFeatureVectors: Record<string, Record<string, number | boolean | string>>,
): Promise<TrainingSample[]> {
  if (plans.length === 0) return []

  const planDescriptions = plans.map((p) =>
    `- ${p.planId}: ${p.planName} (${p.carrier}, ${p.planType})
    Coverage: ${p.coveredBenefits.join(', ')}
    Cost: $${p.monthlyPremium}/mo premium, $${p.deductible} deductible
    Generosity: ${p.generosity}, Exclusions: ${p.exclusionCount}`
  ).join('\n')

  const result = await generateStructuredObject({
    model: trainingModel,
    schema: labelSchema,
    maxTokens: 2000,
    system: `You are a healthcare plan matching expert for Canada. Given a patient profile and a set of insurance plans, rate how well each plan matches the patient's needs.

Use these labels:
- "excellent": This plan is an ideal match for this patient's medical needs, financial situation, and eligibility.
- "good": This plan covers most of the patient's needs well.
- "fair": This plan provides some coverage but has significant gaps for this patient.
- "poor": This plan is not a good fit — wrong eligibility, insufficient coverage, or too expensive.

Consider: medical conditions requiring coverage, medication needs, immigration eligibility, income constraints, and family situation.`,
    prompt: `Rate how well each plan matches this patient:

Patient: ${archetype.label}
Province: ${archetype.profile.province}, Status: ${archetype.profile.immigrationStatus}
Age: ${archetype.medicalFeatures.age}, Employment: ${archetype.profile.employmentStatus}
Income: ${archetype.profile.incomeBand}, Has dependants: ${archetype.profile.hasDependants}
Chronic conditions: ${archetype.medicalFeatures.chronic_count}, Medications: ${archetype.medicalFeatures.medication_count}
Clinical risk: ${archetype.medicalFeatures.clinical_risk}, Mental health needs: ${archetype.medicalFeatures.has_mental_health}

Plans:
${planDescriptions}

Rate each plan for this specific patient.`,
  })

  // Convert LLM ratings to training samples
  const samples: TrainingSample[] = []
  const profileFeatures: Record<string, number | boolean | string> = {
    ...archetype.profile,
    specialCategory: archetype.profile.specialCategory ?? 'none',
    hasDependants: archetype.profile.hasDependants,
  }

  for (const rating of result.ratings) {
    const planFv = planFeatureVectors[rating.planId]
    if (!planFv) continue

    const combined = combineFeaturesForClassifier(
      archetype.medicalFeatures,
      planFv,
      profileFeatures,
    )

    samples.push({
      features: combined,
      label: rating.matchLabel,
      weight: rating.confidence,
    })
  }

  return samples
}

/**
 * Generate full training dataset by labeling all archetypes against all plans.
 */
export async function generateFullTrainingDataset(
  plans: PlanSummaryForLabeling[],
  planFeatureVectors: Record<string, Record<string, number | boolean | string>>,
): Promise<TrainingSample[]> {
  const allSamples: TrainingSample[] = []

  for (const archetype of PATIENT_ARCHETYPES) {
    try {
      console.log(`[training] Generating labels for archetype: ${archetype.label}`)
      const samples = await generateTrainingLabels(archetype, plans, planFeatureVectors)
      allSamples.push(...samples)
      console.log(`[training] ✓ ${archetype.label}: ${samples.length} samples`)
    } catch (err) {
      console.error(`[training] ✗ ${archetype.label}:`, err)
    }
  }

  return allSamples
}

export { PATIENT_ARCHETYPES }
export type { PatientArchetype }
