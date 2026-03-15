import 'server-only'

import { promises as fs } from 'fs'
import path from 'path'
import { RandomForestClassifier, type PredictionResult } from './decision-tree'
import { combineFeaturesForClassifier, type PlanSummaryForLabeling } from './training-data-generator'
import { prisma } from '@/lib/prisma'
import type { ExtractedPlanData, PlanMlFeatures } from '@/lib/plan-feature-pipeline'
import type { MedicalMlFeatures } from '@/lib/medical-feature-pipeline'
import type { UserProfile } from '@/lib/profile'

// ---------------------------------------------------------------------------
// Model file path
// ---------------------------------------------------------------------------

const MODEL_DIR = path.join(process.cwd(), 'data', 'models')
const MODEL_PATH = path.join(MODEL_DIR, 'plan-recommender-forest.json')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MlPlanScore = {
  planId: string
  planName: string
  carrier: string
  planType: string
  jurisdiction: string

  // ML classifier output
  matchLabel: string          // 'excellent' | 'good' | 'fair' | 'poor'
  matchProbability: number    // 0-1 probability of the predicted label
  classProbabilities: Record<string, number>
  mlScore: number             // 0-100 composite score

  // Eligibility (from rule engine)
  eligibilityStatus: string

  // Feature-based explanation
  decisionFactors: string[]

  // Plan details for display
  summary: string
  monthlyCostEstimate: string
  coverageHighlights: string[]
  gaps: string[]
  generosity: string
}

export type Top3Recommendation = {
  top3: MlPlanScore[]
  allScored: MlPlanScore[]
  modelInfo: {
    trained: boolean
    treeCount: number
    featureImportances: Array<{ feature: string; importance: number }>
  }
}

// ---------------------------------------------------------------------------
// Load / save model
// ---------------------------------------------------------------------------

let cachedForest: RandomForestClassifier | null = null

async function loadModel(): Promise<RandomForestClassifier | null> {
  if (cachedForest) return cachedForest

  try {
    const json = await fs.readFile(MODEL_PATH, 'utf-8')
    cachedForest = RandomForestClassifier.deserialize(json)
    return cachedForest
  } catch {
    return null
  }
}

export async function saveModel(forest: RandomForestClassifier): Promise<void> {
  await fs.mkdir(MODEL_DIR, { recursive: true })
  await fs.writeFile(MODEL_PATH, forest.serialize(), 'utf-8')
  cachedForest = forest
}

export function clearModelCache(): void {
  cachedForest = null
}

// ---------------------------------------------------------------------------
// Convert profile + medical features to patient feature vector
// ---------------------------------------------------------------------------

function buildPatientFeatures(
  profile: UserProfile,
  medicalFeatures?: MedicalMlFeatures | null,
): Record<string, number | boolean> {
  const ageMidpoints: Record<string, number> = {
    '0-17': 10, '18-25': 22, '26-35': 30, '36-45': 40,
    '46-55': 50, '56-64': 60, '65+': 70,
  }

  const riskMap: Record<string, number> = {
    low: 0, moderate: 1, high: 2, very_high: 3,
  }

  const features: Record<string, number | boolean> = {
    age: ageMidpoints[profile.ageBand] ?? 30,
    condition_count: medicalFeatures?.counts.conditionCount ?? 0,
    chronic_count: medicalFeatures?.counts.chronicConditionCount ?? 0,
    medication_count: medicalFeatures?.counts.medicationCount ?? 0,
    surgery_count: medicalFeatures?.counts.surgeryCount ?? 0,
    allergy_count: medicalFeatures?.counts.allergyCount ?? 0,
    clinical_risk: riskMap[medicalFeatures?.derivedIndicators.overallClinicalRisk ?? 'low'] ?? 0,
    has_cardiometabolic: medicalFeatures?.conditionFlags.hasCardiometabolicDisease ?? false,
    has_respiratory: medicalFeatures?.conditionFlags.hasRespiratoryDisease ?? false,
    has_mental_health: medicalFeatures?.conditionFlags.hasMentalHealthCondition ?? false,
    has_cancer_history: medicalFeatures?.conditionFlags.hasCancerHistory ?? false,
    has_polypharmacy: medicalFeatures?.medicationFlags.hasPolypharmacy ?? false,
    needs_followup: medicalFeatures?.utilizationFlags.needsNearTermFollowUp ?? false,
    recent_hospitalization: medicalFeatures?.utilizationFlags.recentHospitalization ?? false,
    recent_emergency: medicalFeatures?.utilizationFlags.recentEmergencyCare ?? false,
  }

  return features
}

function buildProfileFeatures(profile: UserProfile): Record<string, number | boolean | string> {
  return {
    immigrationStatus: profile.immigrationStatus,
    employmentStatus: profile.employmentStatus,
    incomeBand: profile.incomeBand,
    hasEmployerBenefits: profile.hasEmployerBenefits,
    hasDependants: profile.dependants.spouse || profile.dependants.children > 0,
  }
}

// ---------------------------------------------------------------------------
// Load extracted plans from DB
// ---------------------------------------------------------------------------

async function loadPlansFromDb(): Promise<{
  plans: Array<{ extracted: ExtractedPlanData; features: PlanMlFeatures }>
}> {
  try {
    const rows = await prisma.extractedPlan.findMany({
      select: { extractedData: true, mlFeatures: true },
    })

    return {
      plans: rows.map((row) => ({
        extracted: row.extractedData as unknown as ExtractedPlanData,
        features: row.mlFeatures as unknown as PlanMlFeatures,
      })),
    }
  } catch {
    return { plans: [] }
  }
}

// ---------------------------------------------------------------------------
// Generate explanation from decision path and features
// ---------------------------------------------------------------------------

function generateDecisionFactors(
  prediction: PredictionResult,
  patientFeatures: Record<string, number | boolean>,
  planFeatures: PlanMlFeatures,
  profile: UserProfile,
): string[] {
  const factors: string[] = []

  // Coverage match factors
  if (patientFeatures.chronic_count as number > 0 && planFeatures.coversPrescriptionDrugs) {
    factors.push('Covers prescription drugs needed for chronic conditions')
  }
  if (patientFeatures.has_mental_health && planFeatures.coversMentalHealth) {
    factors.push('Includes mental health coverage matching your needs')
  }
  if (patientFeatures.has_cardiometabolic && planFeatures.coversSpecialist) {
    factors.push('Specialist coverage for cardiometabolic care')
  }

  // Cost factors
  if (profile.incomeBand === 'low' && planFeatures.isPublic) {
    factors.push('Publicly funded — no premiums for your income level')
  }
  if (planFeatures.monthlyPremiumEstimate === 0) {
    factors.push('No monthly premium cost')
  }
  if (planFeatures.avgReimbursementPct >= 80) {
    factors.push(`High reimbursement rate (${planFeatures.avgReimbursementPct}% average)`)
  }

  // Eligibility factors
  if (['refugee', 'asylum_seeker'].includes(profile.immigrationStatus) &&
      planFeatures.planType === 'temporary_coverage') {
    factors.push('Specifically designed for your immigration status')
  }
  if (profile.immigrationStatus === 'student_visa' &&
      planFeatures.planType === 'private_individual') {
    factors.push('Suitable private coverage for international students')
  }

  // Coverage breadth
  if (planFeatures.coveredBenefitCount >= 8) {
    factors.push(`Broad coverage (${planFeatures.coveredBenefitCount} benefit categories)`)
  }
  if (planFeatures.coversDental && planFeatures.coversVision) {
    factors.push('Includes both dental and vision coverage')
  }

  // From decision tree path — extract the most important splits
  for (const step of prediction.decisionPath.slice(0, 3)) {
    if (step.feature.startsWith('interaction_')) {
      const humanName = step.feature
        .replace('interaction_', '')
        .replace(/_/g, ' ')
      factors.push(`Match signal: ${humanName}`)
    }
  }

  return factors.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Compute ML score from class probabilities
// ---------------------------------------------------------------------------

function computeMlScore(probs: Record<string, number>): number {
  const weights = { excellent: 100, good: 70, fair: 40, poor: 10 }
  let score = 0
  for (const [label, prob] of Object.entries(probs)) {
    score += (weights[label as keyof typeof weights] ?? 0) * prob
  }
  return Math.round(score)
}

// ---------------------------------------------------------------------------
// Main recommendation function
// ---------------------------------------------------------------------------

export async function getTop3Recommendations(
  profile: UserProfile,
  medicalFeatures?: MedicalMlFeatures | null,
  eligibilityResults?: Array<{ planType: string; eligible: string }>,
): Promise<Top3Recommendation> {
  const forest = await loadModel()
  const { plans } = await loadPlansFromDb()

  if (plans.length === 0) {
    return {
      top3: [],
      allScored: [],
      modelInfo: { trained: !!forest, treeCount: 0, featureImportances: [] },
    }
  }

  const patientFeatures = buildPatientFeatures(profile, medicalFeatures)
  const profileFeatures = buildProfileFeatures(profile)

  const scored: MlPlanScore[] = []

  for (const { extracted, features } of plans) {
    const planFv = features.featureVector

    // Determine eligibility status from rule engine results
    const eligibility = eligibilityResults?.find(
      (e) => e.planType === extracted.planType,
    )
    const eligibilityStatus = eligibility?.eligible ?? 'unknown'

    // Skip plans user is definitely not eligible for
    if (eligibilityStatus === 'no') continue

    let matchLabel = 'fair'
    let matchProbability = 0.5
    let classProbabilities: Record<string, number> = {
      excellent: 0.1, good: 0.3, fair: 0.4, poor: 0.2,
    }
    let mlScore = 40
    let decisionFactors: string[] = []

    if (forest) {
      // ML prediction
      const combined = combineFeaturesForClassifier(patientFeatures, planFv, profileFeatures)
      const prediction = forest.predict(combined)

      matchLabel = prediction.prediction
      matchProbability = prediction.confidence
      classProbabilities = prediction.classProbabilities
      mlScore = computeMlScore(classProbabilities)
      decisionFactors = generateDecisionFactors(prediction, patientFeatures, features, profile)
    } else {
      // Heuristic scoring when no model is trained
      mlScore = heuristicScore(patientFeatures, features, profile, eligibilityStatus)
      matchLabel = mlScore >= 75 ? 'excellent' : mlScore >= 55 ? 'good' : mlScore >= 35 ? 'fair' : 'poor'
      matchProbability = mlScore / 100
      classProbabilities = { [matchLabel]: matchProbability }
      decisionFactors = generateDecisionFactors(
        { prediction: matchLabel, confidence: matchProbability, classProbabilities, decisionPath: [] },
        patientFeatures, features, profile,
      )
    }

    // Eligibility boost/penalty
    if (eligibilityStatus === 'yes') mlScore = Math.min(100, mlScore + 10)
    if (eligibilityStatus === 'unlikely') mlScore = Math.max(0, mlScore - 20)

    // Identify coverage gaps
    const gaps: string[] = []
    if (!features.coversPrescriptionDrugs && (patientFeatures.medication_count as number) > 0) {
      gaps.push('Does not cover prescription drugs (you take medications)')
    }
    if (!features.coversDental) gaps.push('No dental coverage')
    if (!features.coversVision) gaps.push('No vision coverage')
    if (!features.coversMentalHealth && patientFeatures.has_mental_health) {
      gaps.push('No mental health coverage (flagged in your profile)')
    }
    if (features.hasWaitingPeriod) gaps.push('Has a waiting period before coverage begins')

    // Coverage highlights
    const highlights: string[] = []
    if (features.coversPrescriptionDrugs) highlights.push('Prescription drugs')
    if (features.coversDental) highlights.push('Dental care')
    if (features.coversVision) highlights.push('Vision care')
    if (features.coversHospital) highlights.push('Hospital services')
    if (features.coversMentalHealth) highlights.push('Mental health')
    if (features.coversEmergency) highlights.push('Emergency services')
    if (features.coversTravelMedical) highlights.push('Travel medical')
    if (features.coversPhysiotherapy) highlights.push('Physiotherapy')

    scored.push({
      planId: features.planId,
      planName: extracted.planName,
      carrier: extracted.carrier,
      planType: extracted.planType,
      jurisdiction: extracted.jurisdiction,
      matchLabel,
      matchProbability,
      classProbabilities,
      mlScore,
      eligibilityStatus,
      decisionFactors,
      summary: extracted.summary,
      monthlyCostEstimate: features.monthlyPremiumEstimate > 0
        ? `$${features.monthlyPremiumEstimate}/mo`
        : 'No premium (publicly funded)',
      coverageHighlights: highlights.slice(0, 5),
      gaps: gaps.slice(0, 4),
      generosity: features.overallGenerosity,
    })
  }

  // Sort by ML score descending
  scored.sort((a, b) => b.mlScore - a.mlScore)

  const top3 = scored.slice(0, 3)

  return {
    top3,
    allScored: scored,
    modelInfo: {
      trained: !!forest,
      treeCount: forest ? 10 : 0, // default forest size
      featureImportances: forest
        ? Object.entries(forest.getFeatureImportances())
            .map(([feature, importance]) => ({ feature, importance }))
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 15)
        : [],
    },
  }
}

// ---------------------------------------------------------------------------
// Heuristic scoring (used when no trained model is available)
// ---------------------------------------------------------------------------

function heuristicScore(
  patient: Record<string, number | boolean>,
  plan: PlanMlFeatures,
  profile: UserProfile,
  eligibility: string,
): number {
  let score = 50

  // Eligibility baseline
  if (eligibility === 'yes') score += 15
  else if (eligibility === 'likely') score += 10
  else if (eligibility === 'unlikely') score -= 15
  else if (eligibility === 'no') return 5

  // Coverage matching
  if ((patient.medication_count as number) > 0 && plan.coversPrescriptionDrugs) score += 10
  if (patient.has_mental_health && plan.coversMentalHealth) score += 10
  if (patient.has_cardiometabolic && plan.coversSpecialist) score += 8
  if ((patient.chronic_count as number) > 1 && plan.coveredBenefitCount >= 8) score += 8

  // Cost appropriateness
  if (profile.incomeBand === 'low') {
    if (plan.isPublic) score += 12
    if (plan.monthlyPremiumEstimate === 0) score += 8
    if (plan.monthlyPremiumEstimate > 100) score -= 10
  }
  if (profile.incomeBand === 'high' && plan.overallGenerosity === 'premium') score += 5

  // Special populations
  if (['refugee', 'asylum_seeker'].includes(profile.immigrationStatus)) {
    if (plan.planType === 'temporary_coverage') score += 15
    if (plan.planType === 'private_individual') score -= 5
  }
  if (profile.immigrationStatus === 'student_visa' && plan.planType === 'private_individual') {
    score += 8
  }

  // Family coverage
  if (profile.dependants.children > 0 && plan.coversDental) score += 5

  // Generosity bonus
  const genMap: Record<string, number> = {
    minimal: -5, basic: 0, moderate: 5, comprehensive: 8, premium: 10,
  }
  score += genMap[plan.overallGenerosity] ?? 0

  return Math.max(0, Math.min(100, score))
}
