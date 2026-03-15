import 'server-only'

import { z } from 'zod'
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative } from 'path'
import { generateStructuredObject, generateChatText } from '@/lib/llm-client'

const extractionModel =
  process.env.MEDICAL_EXTRACTION_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b'

const DOCS_REPO_PATH = process.env.DOCS_REPO_PATH ?? ''

// ---------------------------------------------------------------------------
// Zod schemas — the structured output the LLM must produce per document
// ---------------------------------------------------------------------------

const benefitCoverageSchema = z.object({
  category: z.string().describe('e.g. prescription_drugs, dental, vision, hospital, mental_health, emergency, travel_medical, specialist, lab_diagnostic, ambulance, physiotherapy, chiropractic, naturopath, massage, medical_equipment, hearing'),
  covered: z.boolean(),
  reimbursementPct: z.number().min(0).max(100).nullable().describe('Reimbursement percentage, null if not stated'),
  annualMaximum: z.number().nullable().describe('Annual dollar maximum per person, null if not stated'),
  lifetimeMaximum: z.number().nullable().describe('Lifetime dollar maximum, null if not stated'),
  copay: z.number().nullable().describe('Fixed copay amount in dollars, null if not stated'),
  waitingPeriodDays: z.number().nullable().describe('Waiting period in days before benefit is active, null if none'),
  preauthorizationRequired: z.boolean(),
  notes: z.string().describe('Key conditions, limits or exceptions in one sentence'),
})

const eligibilitySchema = z.object({
  eligiblePopulations: z.array(z.string()).describe('Who can enroll: e.g. Canadian residents, federal employees, refugees, Ontario residents, individual purchasers'),
  ageRestrictions: z.string().nullable().describe('Age limits if any'),
  residencyRequirements: z.string().nullable(),
  incomeRequirements: z.string().nullable().describe('Income thresholds for eligibility or co-pay tiers'),
  employmentRequirements: z.string().nullable(),
  waitingPeriodDays: z.number().nullable().describe('General waiting period before coverage starts'),
})

const costStructureSchema = z.object({
  premiumType: z.enum(['free', 'employer_paid', 'individual_paid', 'cost_shared', 'unknown']),
  monthlyPremiumEstimate: z.number().nullable().describe('Estimated monthly premium in CAD, null if free or unknown'),
  deductible: z.number().nullable().describe('Annual deductible in dollars'),
  coinsuranceDefault: z.number().nullable().describe('Default coinsurance percentage the plan pays'),
  maxOutOfPocket: z.number().nullable().describe('Annual max out-of-pocket'),
  hasIncomeTieredCopay: z.boolean().describe('Whether copay/coverage varies by income'),
  incomeTiers: z.array(z.object({
    incomeRange: z.string(),
    coveragePct: z.number(),
    copayPct: z.number(),
  })).default([]),
})

const extractedPlanSchema = z.object({
  planName: z.string(),
  planType: z.enum(['private_individual', 'private_group', 'provincial_public', 'federal_public', 'federal_employee', 'temporary_coverage', 'dental_public', 'other']),
  carrier: z.string().describe('Insurance company or government body'),
  jurisdiction: z.string().describe('Province, territory, or "Canada" for federal'),
  effectiveDate: z.string().nullable().describe('When the plan terms are effective, ISO date or description'),
  summary: z.string().describe('2-3 sentence plain-language summary of what this plan is'),
  eligibility: eligibilitySchema,
  costStructure: costStructureSchema,
  benefits: z.array(benefitCoverageSchema),
  exclusions: z.array(z.string()).describe('Major exclusions or things explicitly not covered'),
  claimsProcess: z.string().nullable().describe('How to submit claims, one sentence'),
  renewalTerms: z.string().nullable().describe('How the plan renews or terminates'),
  sourceFile: z.string(),
  extractionConfidence: z.enum(['low', 'medium', 'high']),
})

export type ExtractedPlanData = z.infer<typeof extractedPlanSchema>

// ---------------------------------------------------------------------------
// ML feature vector schema — flattened numeric/boolean features for classifiers
// ---------------------------------------------------------------------------

const planMlFeaturesSchema = z.object({
  // Identity
  planId: z.string(),
  planName: z.string(),
  planType: z.string(),
  carrier: z.string(),
  jurisdiction: z.string(),

  // Cost features (numeric)
  monthlyPremiumEstimate: z.number(),
  deductible: z.number(),
  coinsuranceDefault: z.number(),
  maxOutOfPocket: z.number(),

  // Coverage breadth (counts)
  totalBenefitCategories: z.number().int(),
  coveredBenefitCount: z.number().int(),
  preauthorizationRequiredCount: z.number().int(),

  // Coverage flags (boolean)
  coversPrescriptionDrugs: z.boolean(),
  coversDental: z.boolean(),
  coversVision: z.boolean(),
  coversHospital: z.boolean(),
  coversMentalHealth: z.boolean(),
  coversEmergency: z.boolean(),
  coversTravelMedical: z.boolean(),
  coversSpecialist: z.boolean(),
  coversPhysiotherapy: z.boolean(),
  coversChiropractic: z.boolean(),

  // Reimbursement stats
  avgReimbursementPct: z.number(),
  minReimbursementPct: z.number(),
  maxReimbursementPct: z.number(),

  // Eligibility features
  isPublic: z.boolean(),
  hasIncomeRequirement: z.boolean(),
  hasResidencyRequirement: z.boolean(),
  hasWaitingPeriod: z.boolean(),

  // Risk / complexity
  exclusionCount: z.number().int(),
  hasIncomeTieredCopay: z.boolean(),

  // LLM-derived
  overallGenerosity: z.enum(['minimal', 'basic', 'moderate', 'comprehensive', 'premium']),
  bestForProfile: z.string().describe('One sentence: who this plan is ideal for'),

  // Flat feature vector for ML classifiers
  featureVector: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
})

export type PlanMlFeatures = z.infer<typeof planMlFeaturesSchema>

// ---------------------------------------------------------------------------
// Step 1: Discover and read all markdown files
// ---------------------------------------------------------------------------

async function discoverMarkdownFiles(dirPath: string): Promise<{ relativePath: string; content: string }[]> {
  const files: { relativePath: string; content: string }[] = []

  async function walk(current: string) {
    const entries = await readdir(current)
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const fullPath = join(current, entry)
      const stats = await stat(fullPath)
      if (stats.isDirectory()) {
        await walk(fullPath)
      } else if (entry.endsWith('.md')) {
        const content = await readFile(fullPath, 'utf-8')
        // Skip near-duplicate files (same name with " (1)" suffix)
        if (!entry.includes('(1)')) {
          files.push({
            relativePath: relative(dirPath, fullPath).replace(/\\/g, '/'),
            content,
          })
        }
      }
    }
  }

  await walk(dirPath)
  return files
}

// ---------------------------------------------------------------------------
// Step 2: Chunk large documents for LLM context window
// ---------------------------------------------------------------------------

const MAX_CHUNK_CHARS = 12_000

function chunkDocument(content: string): string[] {
  if (content.length <= MAX_CHUNK_CHARS) return [content]

  const chunks: string[] = []
  const sections = content.split(/(?=^##\s)/m)
  let current = ''

  for (const section of sections) {
    if (current.length + section.length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current)
      current = ''
    }
    current += section
  }
  if (current.trim()) chunks.push(current)

  return chunks
}

// ---------------------------------------------------------------------------
// Step 3: LLM extraction — send document to Groq, get structured plan data
// ---------------------------------------------------------------------------

async function extractPlanFromDocument(
  filePath: string,
  content: string,
): Promise<ExtractedPlanData> {
  const chunks = chunkDocument(content)

  // If the document fits in one chunk, extract directly
  if (chunks.length === 1) {
    return generateStructuredObject({
      model: extractionModel,
      schema: extractedPlanSchema,
      maxTokens: 4000,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: buildExtractionPrompt(filePath, chunks[0]),
    })
  }

  // For large documents: summarize each chunk, then extract from combined summaries
  const chunkSummaries = await Promise.all(
    chunks.map(async (chunk, i) => {
      const summary = await generateChatText({
        model: extractionModel,
        system:
          'You are extracting insurance plan details from a document chunk. Return a detailed summary focusing on: plan name, carrier, coverage benefits (what is covered, reimbursement percentages, maximums, copays), eligibility, costs, exclusions, and claims process. Preserve all specific numbers, percentages, and dollar amounts.',
        messages: [
          {
            role: 'user',
            content: `This is chunk ${i + 1} of ${chunks.length} from "${filePath}".\n\n${chunk.slice(0, MAX_CHUNK_CHARS)}`,
          },
        ],
        maxTokens: 2000,
      })
      return summary
    }),
  )

  const combinedSummary = chunkSummaries.join('\n\n---\n\n')

  return generateStructuredObject({
    model: extractionModel,
    schema: extractedPlanSchema,
    maxTokens: 4000,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildExtractionPrompt(filePath, combinedSummary),
  })
}

const EXTRACTION_SYSTEM_PROMPT = `You are an insurance plan data extraction engine. Given raw text from a healthcare plan document, extract ALL structured plan information.

You must use semantic understanding to:
1. Identify the plan name, carrier/provider, and type (private, public, federal, dental, etc.)
2. Extract every benefit category with reimbursement rates, maximums, copays, and waiting periods
3. Determine eligibility criteria (who qualifies, age limits, residency, income thresholds)
4. Extract the full cost structure (premiums, deductibles, coinsurance, out-of-pocket maximums)
5. List exclusions (what is NOT covered)
6. Note claims submission process and renewal terms

Be thorough — extract every benefit mentioned even if details are sparse. Use null for truly unknown values.
Mark extractionConfidence as "low" if the document is fragmentary, "medium" if key details are present, "high" if comprehensive.

Return ONLY valid JSON matching the requested schema.`

function buildExtractionPrompt(filePath: string, text: string): string {
  return [
    `Extract structured insurance plan data from this document.`,
    ``,
    `Source file: ${filePath}`,
    ``,
    `--- DOCUMENT TEXT ---`,
    text.slice(0, 20_000),
    `--- END ---`,
    ``,
    `Extract the plan information as structured JSON. Include every benefit category you can find.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Step 4: Derive ML features from extracted plan data
// ---------------------------------------------------------------------------

function derivePlanMlFeatures(plan: ExtractedPlanData): PlanMlFeatures {
  const coveredBenefits = plan.benefits.filter((b) => b.covered)
  const reimbursements = coveredBenefits
    .map((b) => b.reimbursementPct)
    .filter((r): r is number => r !== null)

  const hasBenefit = (category: string) =>
    plan.benefits.some(
      (b) => b.covered && b.category.toLowerCase().includes(category),
    )

  const isPublic = ['provincial_public', 'federal_public', 'federal_employee', 'dental_public', 'temporary_coverage'].includes(plan.planType)

  const features: PlanMlFeatures = {
    planId: `${plan.carrier.toLowerCase().replace(/\s+/g, '-')}-${plan.planName.toLowerCase().replace(/\s+/g, '-')}`.slice(0, 80),
    planName: plan.planName,
    planType: plan.planType,
    carrier: plan.carrier,
    jurisdiction: plan.jurisdiction,

    monthlyPremiumEstimate: plan.costStructure.monthlyPremiumEstimate ?? 0,
    deductible: plan.costStructure.deductible ?? 0,
    coinsuranceDefault: plan.costStructure.coinsuranceDefault ?? 0,
    maxOutOfPocket: plan.costStructure.maxOutOfPocket ?? 0,

    totalBenefitCategories: plan.benefits.length,
    coveredBenefitCount: coveredBenefits.length,
    preauthorizationRequiredCount: plan.benefits.filter((b) => b.preauthorizationRequired).length,

    coversPrescriptionDrugs: hasBenefit('drug') || hasBenefit('prescription'),
    coversDental: hasBenefit('dental'),
    coversVision: hasBenefit('vision') || hasBenefit('optometry'),
    coversHospital: hasBenefit('hospital'),
    coversMentalHealth: hasBenefit('mental') || hasBenefit('psych') || hasBenefit('counsel'),
    coversEmergency: hasBenefit('emergency') || hasBenefit('ambulance'),
    coversTravelMedical: hasBenefit('travel'),
    coversSpecialist: hasBenefit('specialist'),
    coversPhysiotherapy: hasBenefit('physio'),
    coversChiropractic: hasBenefit('chiro'),

    avgReimbursementPct: reimbursements.length ? Math.round(reimbursements.reduce((a, b) => a + b, 0) / reimbursements.length) : 0,
    minReimbursementPct: reimbursements.length ? Math.min(...reimbursements) : 0,
    maxReimbursementPct: reimbursements.length ? Math.max(...reimbursements) : 0,

    isPublic,
    hasIncomeRequirement: !!plan.eligibility.incomeRequirements,
    hasResidencyRequirement: !!plan.eligibility.residencyRequirements,
    hasWaitingPeriod: (plan.eligibility.waitingPeriodDays ?? 0) > 0,

    exclusionCount: plan.exclusions.length,
    hasIncomeTieredCopay: plan.costStructure.hasIncomeTieredCopay,

    // These will be overridden by LLM if we do the second pass
    overallGenerosity: 'moderate',
    bestForProfile: '',

    featureVector: {},
  }

  // Build flat feature vector for ML classifiers
  features.featureVector = {
    plan_type: features.planType,
    jurisdiction: features.jurisdiction,
    is_public: features.isPublic,
    monthly_premium: features.monthlyPremiumEstimate,
    deductible: features.deductible,
    coinsurance_default: features.coinsuranceDefault,
    max_oop: features.maxOutOfPocket,
    covered_count: features.coveredBenefitCount,
    total_categories: features.totalBenefitCategories,
    coverage_ratio: features.totalBenefitCategories > 0
      ? Math.round((features.coveredBenefitCount / features.totalBenefitCategories) * 100)
      : 0,
    preauth_count: features.preauthorizationRequiredCount,
    covers_drugs: features.coversPrescriptionDrugs,
    covers_dental: features.coversDental,
    covers_vision: features.coversVision,
    covers_hospital: features.coversHospital,
    covers_mental_health: features.coversMentalHealth,
    covers_emergency: features.coversEmergency,
    covers_travel: features.coversTravelMedical,
    covers_specialist: features.coversSpecialist,
    covers_physio: features.coversPhysiotherapy,
    covers_chiro: features.coversChiropractic,
    avg_reimbursement: features.avgReimbursementPct,
    min_reimbursement: features.minReimbursementPct,
    max_reimbursement: features.maxReimbursementPct,
    has_income_requirement: features.hasIncomeRequirement,
    has_residency_requirement: features.hasResidencyRequirement,
    has_waiting_period: features.hasWaitingPeriod,
    exclusion_count: features.exclusionCount,
    has_income_tiered_copay: features.hasIncomeTieredCopay,
  }

  return features
}

// ---------------------------------------------------------------------------
// Step 5: LLM second pass — generosity rating and "best for" profile
// ---------------------------------------------------------------------------

async function enrichWithLlmRating(
  plan: ExtractedPlanData,
  features: PlanMlFeatures,
): Promise<PlanMlFeatures> {
  const ratingSchema = z.object({
    overallGenerosity: z.enum(['minimal', 'basic', 'moderate', 'comprehensive', 'premium']),
    bestForProfile: z.string(),
  })

  try {
    const rating = await generateStructuredObject({
      model: extractionModel,
      schema: ratingSchema,
      maxTokens: 500,
      system:
        'You rate insurance plans. Given a plan summary and its extracted features, determine: (1) overallGenerosity on a 5-point scale, and (2) a one-sentence description of who this plan is best suited for. Be specific about demographics, health needs, and financial situation.',
      prompt: `Plan: ${plan.planName} (${plan.carrier})
Type: ${plan.planType}, Jurisdiction: ${plan.jurisdiction}
Summary: ${plan.summary}
Benefits covered: ${features.coveredBenefitCount} of ${features.totalBenefitCategories} categories
Avg reimbursement: ${features.avgReimbursementPct}%
Premium: $${features.monthlyPremiumEstimate}/mo, Deductible: $${features.deductible}
Exclusions: ${plan.exclusions.length}
Income tiered: ${features.hasIncomeTieredCopay}

Rate this plan's generosity and describe who it's best for.`,
    })

    features.overallGenerosity = rating.overallGenerosity
    features.bestForProfile = rating.bestForProfile
    features.featureVector.generosity = rating.overallGenerosity
  } catch {
    // Keep defaults on LLM failure
    features.bestForProfile = `Residents of ${plan.jurisdiction} seeking ${plan.planType.replace(/_/g, ' ')} coverage`
  }

  return features
}

// ---------------------------------------------------------------------------
// Main pipeline: orchestrates the full extraction
// ---------------------------------------------------------------------------

export type PlanExtractionResult = {
  sourceFile: string
  extractedPlan: ExtractedPlanData
  mlFeatures: PlanMlFeatures
}

export async function runPlanFeaturePipeline(): Promise<{
  results: PlanExtractionResult[]
  errors: { file: string; error: string }[]
  summary: {
    totalFiles: number
    successCount: number
    errorCount: number
    plansExtracted: number
  }
}> {
  if (!DOCS_REPO_PATH) {
    throw new Error('DOCS_REPO_PATH environment variable is not set. Point it to the docs-source directory.')
  }

  const files = await discoverMarkdownFiles(DOCS_REPO_PATH)
  const results: PlanExtractionResult[] = []
  const errors: { file: string; error: string }[] = []

  // Process files sequentially to stay within Groq rate limits
  for (const file of files) {
    try {
      console.log(`[plan-pipeline] Extracting: ${file.relativePath}`)

      // Step 3: LLM extraction
      const extractedPlan = await extractPlanFromDocument(file.relativePath, file.content)

      // Step 4: Derive numeric/boolean ML features
      const mlFeatures = derivePlanMlFeatures(extractedPlan)

      // Step 5: LLM enrichment pass
      const enrichedFeatures = await enrichWithLlmRating(extractedPlan, mlFeatures)

      results.push({
        sourceFile: file.relativePath,
        extractedPlan,
        mlFeatures: enrichedFeatures,
      })

      console.log(`[plan-pipeline] ✓ ${file.relativePath} → ${extractedPlan.planName}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[plan-pipeline] ✗ ${file.relativePath}: ${message}`)
      errors.push({ file: file.relativePath, error: message })
    }
  }

  return {
    results,
    errors,
    summary: {
      totalFiles: files.length,
      successCount: results.length,
      errorCount: errors.length,
      plansExtracted: results.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Single-file extraction (for incremental use)
// ---------------------------------------------------------------------------

export async function extractSinglePlan(filePath: string, content: string): Promise<PlanExtractionResult> {
  const extractedPlan = await extractPlanFromDocument(filePath, content)
  const mlFeatures = derivePlanMlFeatures(extractedPlan)
  const enrichedFeatures = await enrichWithLlmRating(extractedPlan, mlFeatures)

  return {
    sourceFile: filePath,
    extractedPlan,
    mlFeatures: enrichedFeatures,
  }
}
