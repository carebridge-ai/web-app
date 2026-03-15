import 'server-only'

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Numeric feature vector stored in the Plan.features Json field. */
export type PlanFeatureVector = {
  // Normalized cost features (0–1 scale)
  normalized_premium: number
  normalized_deductible: number
  normalized_oop_max: number
  normalized_coinsurance: number

  // Copay features (raw dollars, useful for ML)
  copay_primary: number
  copay_specialist: number
  copay_er: number

  // Coverage breadth (0–1 score)
  coverage_breadth_score: number

  // Drug coverage depth (0–1 score)
  drug_tier_depth: number

  // Network size (0–1 score)
  network_size_score: number

  // Boolean flags (0 or 1 for ML compatibility)
  covers_dental: number
  covers_vision: number
  covers_mental_health: number
  covers_maternity: number
  covers_drugs: number
  covers_specialist: number
  covers_hospital: number
  covers_emergency: number
  covers_physiotherapy: number

  // Plan metadata encoded
  is_public: number
  is_private: number
  is_federal: number
}

// ---------------------------------------------------------------------------
// Normalization constants — reasonable Canadian insurance ranges
// ---------------------------------------------------------------------------

const MAX_PREMIUM = 800     // ~$800/mo top-end private plan
const MAX_DEDUCTIBLE = 5000
const MAX_OOP = 15000

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

type PlanRecord = {
  monthlyPremium: number
  annualDeductible: number
  deductible: number
  maxOutOfPocket: number
  outOfPocketMax: number
  coinsuranceRate: number
  primaryCareCopay: number
  specialistCopay: number
  erCopay: number
  drugCoverage: unknown
  coverageDetails: unknown
  eligibility: unknown
  formulary: unknown
  providerNetwork: unknown
  type: string
}

/**
 * Compute a numeric ML feature vector from a Plan record.
 * All values are either normalized 0–1 or boolean 0/1.
 */
export function computePlanFeatures(plan: PlanRecord): PlanFeatureVector {
  const deductible = plan.annualDeductible || plan.deductible || 0
  const oopMax = plan.outOfPocketMax || plan.maxOutOfPocket || 0

  // Normalize cost features to 0–1
  const normalized_premium = clamp(plan.monthlyPremium / MAX_PREMIUM)
  const normalized_deductible = clamp(deductible / MAX_DEDUCTIBLE)
  const normalized_oop_max = clamp(oopMax / MAX_OOP)
  const normalized_coinsurance = clamp(plan.coinsuranceRate / 100)

  // Parse JSON fields safely
  const coverage = parseJson(plan.coverageDetails) as Record<string, unknown> | null
  const drug = parseJson(plan.drugCoverage) as Record<string, unknown> | null
  const formulary = parseJson(plan.formulary) as Record<string, unknown> | unknown[] | null
  const network = parseJson(plan.providerNetwork) as Record<string, unknown> | unknown[] | null

  // Coverage boolean flags
  const covers_dental = hasCoverage(coverage, 'dental')
  const covers_vision = hasCoverage(coverage, 'vision')
  const covers_mental_health = hasCoverage(coverage, 'mental', 'mentalHealth', 'mental_health', 'psychiatric')
  const covers_maternity = hasCoverage(coverage, 'maternity', 'prenatal', 'obstetric')
  const covers_drugs = drug != null || hasCoverage(coverage, 'drug', 'drugs', 'prescription', 'prescriptionDrugs', 'prescription_drugs')
  const covers_specialist = hasCoverage(coverage, 'specialist')
  const covers_hospital = hasCoverage(coverage, 'hospital', 'inpatient')
  const covers_emergency = hasCoverage(coverage, 'emergency', 'er', 'emergencyRoom')
  const covers_physiotherapy = hasCoverage(coverage, 'physio', 'physiotherapy', 'physical_therapy')

  // Coverage breadth: count of covered categories / total possible
  const TOTAL_CATEGORIES = 9
  const coveredCount = [
    covers_dental, covers_vision, covers_mental_health, covers_maternity,
    covers_drugs, covers_specialist, covers_hospital, covers_emergency,
    covers_physiotherapy,
  ].filter(Boolean).length
  const coverage_breadth_score = coveredCount / TOTAL_CATEGORIES

  // Drug tier depth: how comprehensive the drug coverage is (0–1)
  const drug_tier_depth = computeDrugTierDepth(drug, formulary)

  // Network size score (0–1)
  const network_size_score = computeNetworkSizeScore(network)

  // Plan type encoding
  const planType = (plan.type ?? '').toLowerCase()
  const is_public = ['provincial', 'federal', 'public'].some((t) => planType.includes(t)) ? 1 : 0
  const is_private = planType.includes('private') || planType.includes('employer') ? 1 : 0
  const is_federal = planType.includes('federal') ? 1 : 0

  return {
    normalized_premium,
    normalized_deductible,
    normalized_oop_max,
    normalized_coinsurance,
    copay_primary: plan.primaryCareCopay,
    copay_specialist: plan.specialistCopay,
    copay_er: plan.erCopay,
    coverage_breadth_score,
    drug_tier_depth,
    network_size_score,
    covers_dental: covers_dental ? 1 : 0,
    covers_vision: covers_vision ? 1 : 0,
    covers_mental_health: covers_mental_health ? 1 : 0,
    covers_maternity: covers_maternity ? 1 : 0,
    covers_drugs: covers_drugs ? 1 : 0,
    covers_specialist: covers_specialist ? 1 : 0,
    covers_hospital: covers_hospital ? 1 : 0,
    covers_emergency: covers_emergency ? 1 : 0,
    covers_physiotherapy: covers_physiotherapy ? 1 : 0,
    is_public,
    is_private,
    is_federal,
  }
}

// ---------------------------------------------------------------------------
// Batch: compute features for all plans and store in DB
// ---------------------------------------------------------------------------

/**
 * Load every Plan record, compute features, and write them back
 * to the `features` Json field. Returns the count of updated plans.
 */
export async function computeAndStoreAllPlanFeatures(): Promise<number> {
  const plans = await prisma.plan.findMany()
  let updated = 0

  for (const plan of plans) {
    const features = computePlanFeatures(plan)
    await prisma.plan.update({
      where: { id: plan.id },
      data: { features },
    })
    updated++
  }

  return updated
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseJson(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return null
}

/**
 * Check if a coverage object has a truthy entry for any of the given keys.
 * Handles both `{ dental: true }` and `{ dental: { covered: true } }` shapes.
 */
function hasCoverage(
  coverage: Record<string, unknown> | null,
  ...keys: string[]
): boolean {
  if (!coverage) return false
  for (const key of keys) {
    const val = coverage[key]
    if (val === true) return true
    if (typeof val === 'object' && val != null) {
      const obj = val as Record<string, unknown>
      if (obj.covered === true || obj.enabled === true) return true
      // If the key exists as a non-empty object, assume it's covered
      if (Object.keys(obj).length > 0) return true
    }
    if (typeof val === 'number' && val > 0) return true
  }
  return false
}

/**
 * Estimate drug tier depth from drugCoverage and formulary data.
 * Score 0–1 based on how many tier/coverage signals are present.
 */
function computeDrugTierDepth(
  drug: Record<string, unknown> | null,
  formulary: Record<string, unknown> | unknown[] | null,
): number {
  let score = 0
  const maxSignals = 5

  if (drug) {
    score += 1 // Has drug coverage data at all
    if (drug.genericCopay != null || drug.generic != null) score += 1
    if (drug.brandCopay != null || drug.brand != null) score += 1
    if (drug.specialtyCopay != null || drug.specialty != null) score += 1
    if (drug.formularyTier != null || drug.tiers != null) score += 1
  } else if (formulary) {
    // Fall back to formulary field
    const entries = Array.isArray(formulary) ? formulary : Object.keys(formulary)
    if (entries.length > 0) score += 1
    if (entries.length > 10) score += 1
    if (entries.length > 50) score += 1
  }

  return clamp(score / maxSignals)
}

/**
 * Estimate network size from providerNetwork data. Score 0–1.
 */
function computeNetworkSizeScore(
  network: Record<string, unknown> | unknown[] | null,
): number {
  if (!network) return 0.5 // Unknown → middle score

  if (Array.isArray(network)) {
    if (network.length === 0) return 0.2
    if (network.length < 50) return 0.4
    if (network.length < 500) return 0.6
    if (network.length < 2000) return 0.8
    return 1.0
  }

  // Object shape — check for size indicators
  const obj = network as Record<string, unknown>
  if (typeof obj.size === 'number') return clamp(obj.size / 5000)
  if (typeof obj.providerCount === 'number') return clamp(obj.providerCount / 5000)
  if (typeof obj.type === 'string') {
    const netType = obj.type.toLowerCase()
    if (netType === 'open' || netType === 'unrestricted') return 1.0
    if (netType === 'broad') return 0.8
    if (netType === 'narrow') return 0.4
    if (netType === 'exclusive') return 0.3
  }

  return 0.5
}
