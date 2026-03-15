import 'server-only'

import { z } from 'zod'
import { generateStructuredObject } from '@/lib/llm-client'
import { getTop3Recommendations, type MlPlanScore, type Top3Recommendation } from './plan-recommender'
import { getQuickEligibility } from '@/lib/recommendation-engine'
import type { UserProfile } from '@/lib/profile'
import type { MedicalMlFeatures } from '@/lib/medical-feature-pipeline'

const explanationModel =
  process.env.CARE_CHAT_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b'

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Per-plan deep explanation produced by the LLM */
const planExplanationSchema = z.object({
  planName: z.string(),
  whyRecommended: z.string().describe('2-4 sentences explaining why the ML model scored this plan highly for this specific user, referencing decision factors'),
  decisionPathNarrative: z.string().describe('Plain-language walk-through of the key decision tree splits that led to this score'),
  strengthsForUser: z.array(z.string()).min(1).max(5).describe('Specific strengths relevant to this user'),
  risksOrGaps: z.array(z.string()).max(4).describe('Honest risks or gaps for this user'),
  comparisonNote: z.string().describe('1-2 sentences comparing this plan to the others in the top 3'),
})

/** Narrative summary across all recommendations */
const narrativeSummarySchema = z.object({
  headline: z.string().describe('One bold sentence summarizing the overall recommendation'),
  situationAnalysis: z.string().describe('2-3 sentences describing what the model understood about this user and their needs'),
  keyInsight: z.string().describe('The single most important takeaway for this user'),
  confidenceStatement: z.string().describe('How confident the model is in these recommendations and why'),
})

/** Radar chart dimension for plan comparison */
const radarDimensionSchema = z.object({
  dimension: z.string().describe('e.g. "Drug Coverage", "Affordability", "Coverage Breadth"'),
  description: z.string().describe('What this dimension measures'),
})

/** Full explanation payload */
const fullExplanationSchema = z.object({
  narrativeSummary: narrativeSummarySchema,
  planExplanations: z.array(planExplanationSchema).min(1).max(3),
  radarDimensions: z.array(radarDimensionSchema).length(6).describe('Exactly 6 dimensions for the radar chart'),
  radarScores: z.array(z.object({
    planName: z.string(),
    scores: z.array(z.number().min(0).max(100)).length(6).describe('Score 0-100 for each of the 6 dimensions, in same order as radarDimensions'),
  })),
})

type FullExplanation = z.infer<typeof fullExplanationSchema>

// ---------------------------------------------------------------------------
// Visualization dataset (derived deterministically from ML outputs)
// ---------------------------------------------------------------------------

export type VisualizationDataset = {
  /** Bar chart: ML score per plan */
  scoreComparison: Array<{
    planName: string
    carrier: string
    mlScore: number
    matchLabel: string
    confidence: number
  }>

  /** Stacked probability chart: class probability distribution per plan */
  probabilityDistribution: Array<{
    planName: string
    excellent: number
    good: number
    fair: number
    poor: number
  }>

  /** Cost comparison: premium, deductible, reimbursement */
  costComparison: Array<{
    planName: string
    monthlyCostEstimate: string
    generosity: string
    coverageHighlights: string[]
    gaps: string[]
  }>

  /** Decision tree feature importances (top features that drove the model) */
  featureImportances: Array<{
    feature: string
    importance: number
    humanLabel: string
  }>

  /** Per-plan decision path — which splits the tree used */
  decisionPaths: Array<{
    planName: string
    factors: string[]
  }>

  /** Radar chart data (LLM-generated scores across dimensions) */
  radarChart: {
    dimensions: Array<{ dimension: string; description: string }>
    plans: Array<{ planName: string; scores: number[] }>
  }
}

export type ExplanationResult = {
  narrative: FullExplanation['narrativeSummary']
  planExplanations: FullExplanation['planExplanations']
  visualization: VisualizationDataset
}

// ---------------------------------------------------------------------------
// Build deterministic visualization data from ML outputs
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  'interaction_chronic_needs_drugs': 'Chronic condition + drug coverage match',
  'interaction_mental_health_covered': 'Mental health need + coverage match',
  'interaction_high_risk_comprehensive': 'High clinical risk + comprehensive plan',
  'interaction_low_income_public': 'Low income + public plan fit',
  'interaction_needs_specialist': 'Multi-condition + specialist access',
  'p_condition_count': 'Number of medical conditions',
  'p_chronic_count': 'Chronic condition count',
  'p_medication_count': 'Medication count',
  'p_clinical_risk': 'Overall clinical risk level',
  'p_age': 'Patient age',
  'plan_coversPrescriptionDrugs': 'Plan covers prescription drugs',
  'plan_coversDental': 'Plan covers dental',
  'plan_coversVision': 'Plan covers vision',
  'plan_coversMentalHealth': 'Plan covers mental health',
  'plan_monthlyPremiumEstimate': 'Monthly premium estimate',
  'plan_deductible': 'Plan deductible amount',
  'plan_coveredBenefitCount': 'Number of covered benefits',
  'plan_avgReimbursementPct': 'Average reimbursement percentage',
  'plan_isPublic': 'Is a public plan',
  'prof_immigrationStatus': 'Immigration status',
  'prof_employmentStatus': 'Employment status',
  'prof_incomeBand': 'Income band',
}

function humanizeFeature(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature.replace(/^(p_|plan_|prof_|interaction_)/, '').replace(/_/g, ' ')
}

function buildVisualizationBase(mlResult: Top3Recommendation): Omit<VisualizationDataset, 'radarChart'> {
  const { top3, modelInfo } = mlResult

  const scoreComparison = top3.map((p) => ({
    planName: p.planName,
    carrier: p.carrier,
    mlScore: p.mlScore,
    matchLabel: p.matchLabel,
    confidence: Math.round(p.matchProbability * 100),
  }))

  const probabilityDistribution = top3.map((p) => ({
    planName: p.planName,
    excellent: Math.round((p.classProbabilities['excellent'] ?? 0) * 100),
    good: Math.round((p.classProbabilities['good'] ?? 0) * 100),
    fair: Math.round((p.classProbabilities['fair'] ?? 0) * 100),
    poor: Math.round((p.classProbabilities['poor'] ?? 0) * 100),
  }))

  const costComparison = top3.map((p) => ({
    planName: p.planName,
    monthlyCostEstimate: p.monthlyCostEstimate,
    generosity: p.generosity,
    coverageHighlights: p.coverageHighlights,
    gaps: p.gaps,
  }))

  const featureImportances = modelInfo.featureImportances.slice(0, 10).map((f) => ({
    feature: f.feature,
    importance: Math.round(f.importance * 1000) / 10,
    humanLabel: humanizeFeature(f.feature),
  }))

  const decisionPaths = top3.map((p) => ({
    planName: p.planName,
    factors: p.decisionFactors,
  }))

  return {
    scoreComparison,
    probabilityDistribution,
    costComparison,
    featureImportances,
    decisionPaths,
  }
}

// ---------------------------------------------------------------------------
// LLM context builder
// ---------------------------------------------------------------------------

function buildExplanationPrompt(
  profile: UserProfile,
  medicalFeatures: MedicalMlFeatures | null | undefined,
  mlResult: Top3Recommendation,
): string {
  const { top3, modelInfo } = mlResult
  const sections: string[] = []

  sections.push(`== USER PROFILE ==
Province: ${profile.province}
Immigration status: ${profile.immigrationStatus.replace(/_/g, ' ')}
Age band: ${profile.ageBand}
Employment: ${profile.employmentStatus.replace(/_/g, ' ')}
Employer benefits: ${profile.hasEmployerBenefits}
Income band: ${profile.incomeBand}
Dependants: ${profile.dependants.spouse ? 'Spouse' : 'No spouse'}, ${profile.dependants.children} child(ren)`)

  if (medicalFeatures) {
    sections.push(`== MEDICAL CONTEXT ==
Conditions: ${medicalFeatures.counts.conditionCount} (${medicalFeatures.counts.chronicConditionCount} chronic)
Medications: ${medicalFeatures.counts.medicationCount}
Clinical risk: ${medicalFeatures.derivedIndicators.overallClinicalRisk}
Key flags: ${[
      medicalFeatures.conditionFlags.hasCardiometabolicDisease && 'cardiometabolic',
      medicalFeatures.conditionFlags.hasRespiratoryDisease && 'respiratory',
      medicalFeatures.conditionFlags.hasMentalHealthCondition && 'mental health',
      medicalFeatures.conditionFlags.hasCancerHistory && 'cancer history',
      medicalFeatures.medicationFlags.hasPolypharmacy && 'polypharmacy',
      medicalFeatures.medicationFlags.hasInsulinOrGlucoseLoweringTherapy && 'diabetes medication',
    ].filter(Boolean).join(', ') || 'None flagged'}`)
  }

  sections.push(`== ML MODEL INFO ==
Model type: ${modelInfo.trained ? 'Trained Random Forest classifier' : 'Heuristic scoring (no trained model)'}
Trees: ${modelInfo.treeCount}
Top features by importance: ${modelInfo.featureImportances.slice(0, 8).map((f) => `${humanizeFeature(f.feature)} (${Math.round(f.importance * 100)}%)`).join(', ')}`)

  for (const plan of top3) {
    sections.push(`== PLAN: ${plan.planName} (${plan.carrier}) ==
ML Score: ${plan.mlScore}/100
Match: ${plan.matchLabel} (${Math.round(plan.matchProbability * 100)}% confidence)
Class probabilities: excellent=${Math.round((plan.classProbabilities['excellent'] ?? 0) * 100)}%, good=${Math.round((plan.classProbabilities['good'] ?? 0) * 100)}%, fair=${Math.round((plan.classProbabilities['fair'] ?? 0) * 100)}%, poor=${Math.round((plan.classProbabilities['poor'] ?? 0) * 100)}%
Eligibility: ${plan.eligibilityStatus}
Type: ${plan.planType}, Jurisdiction: ${plan.jurisdiction}
Cost: ${plan.monthlyCostEstimate}
Generosity: ${plan.generosity}
Decision factors: ${plan.decisionFactors.join('; ')}
Coverage highlights: ${plan.coverageHighlights.join(', ')}
Gaps: ${plan.gaps.length > 0 ? plan.gaps.join('; ') : 'None identified'}
Summary: ${plan.summary}`)
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// System prompt for explanation generation
// ---------------------------------------------------------------------------

const EXPLANATION_SYSTEM_PROMPT = `You are an expert healthcare coverage analyst explaining ML-powered plan recommendations to a user in Canada.

You receive:
1. The user's profile and medical context
2. The ML decision tree classifier's top 3 plan rankings with scores, decision factors, and class probabilities
3. Model metadata (feature importances, tree count, trained vs heuristic)

Your job is to generate:

1. **Narrative Summary** — A warm, accessible summary of the overall recommendation in plain language. The headline should be bold and clear. The situation analysis should show you understand the user. The key insight should be the single most actionable takeaway. The confidence statement should honestly reflect model certainty.

2. **Per-Plan Explanations** — For each of the top 3 plans:
   - Why the model recommended it (reference specific decision factors and feature importances)
   - A plain-language walkthrough of the decision path ("The model first checked whether you have chronic conditions, then looked at whether this plan covers prescription drugs...")
   - Specific strengths and risks for this user
   - How it compares to the other top plans

3. **Radar Chart Scores** — Score each plan 0-100 across exactly 6 dimensions that you define. Choose dimensions that highlight meaningful differences between the plans for this specific user. Common dimensions: Affordability, Drug Coverage, Coverage Breadth, Specialist Access, Dental & Vision, Emergency/Travel. But adapt based on what matters for this user.

GUIDELINES:
- Use warm, supportive, plain language. Avoid jargon.
- Be honest about gaps and limitations.
- Reference Canadian healthcare context (provincial plans, IFHP, CDCP, etc.)
- Make the decision path narrative feel like explaining to a friend, not a technical report.
- Radar scores should reflect genuine differences between plans — don't inflate all scores.

Return ONLY valid JSON matching the requested schema.`

// ---------------------------------------------------------------------------
// Main explanation function
// ---------------------------------------------------------------------------

export async function generateExplanation(
  profile: UserProfile,
  medicalFeatures?: MedicalMlFeatures | null,
): Promise<ExplanationResult> {
  // Step 1: Get eligibility signals for ML
  const eligibility = await getQuickEligibility(profile)
  const eligibilityResults = eligibility.map((e) => ({
    planType: e.planType,
    eligible: e.eligible,
  }))

  // Step 2: Run ML classifier
  const mlResult = await getTop3Recommendations(profile, medicalFeatures, eligibilityResults)

  if (mlResult.top3.length === 0) {
    return {
      narrative: {
        headline: 'No plans available to analyze.',
        situationAnalysis: 'The system could not find any plans in the database to score against your profile. This may mean the plan extraction pipeline has not been run yet.',
        keyInsight: 'Please ensure plans have been extracted and loaded into the database before requesting recommendations.',
        confidenceStatement: 'No model predictions were made.',
      },
      planExplanations: [],
      visualization: {
        scoreComparison: [],
        probabilityDistribution: [],
        costComparison: [],
        featureImportances: [],
        decisionPaths: [],
        radarChart: { dimensions: [], plans: [] },
      },
    }
  }

  // Step 3: Build deterministic visualization data
  const vizBase = buildVisualizationBase(mlResult)

  // Step 4: Call Groq LLM for rich explanations + radar scores
  const prompt = buildExplanationPrompt(profile, medicalFeatures, mlResult)

  let llmResult: FullExplanation | null = null
  try {
    llmResult = await generateStructuredObject({
      model: explanationModel,
      schema: fullExplanationSchema,
      maxTokens: 6000,
      system: EXPLANATION_SYSTEM_PROMPT,
      prompt: `Generate detailed explanations and radar chart scores for these ML plan recommendations.\n\n${prompt}`,
    })
  } catch (err) {
    console.warn('[explanation-engine] LLM structured output failed, using fallback:', err instanceof Error ? err.message : err)
  }

  // Fallback: generate basic explanations from ML data if LLM fails
  const fallbackNarrative = {
    headline: `Top recommendation: ${mlResult.top3[0]?.planName ?? 'Unknown'}`,
    situationAnalysis: `Based on your profile as a ${profile.ageBand} year old ${profile.employmentStatus.replace(/_/g, ' ')} in ${profile.province}, we analyzed ${mlResult.allScored.length} available plans.`,
    keyInsight: mlResult.top3[0]
      ? `${mlResult.top3[0].planName} scored ${mlResult.top3[0].mlScore}/100 — ${mlResult.top3[0].summary}`
      : 'Complete your profile for personalized recommendations.',
    confidenceStatement: mlResult.modelInfo.trained
      ? 'Scores generated by a trained Random Forest classifier.'
      : 'Scores generated by heuristic matching (no trained model available).',
  }

  const fallbackExplanations = mlResult.top3.map((p) => ({
    planName: p.planName,
    whyRecommended: p.summary,
    decisionPathNarrative: p.decisionFactors.length > 0
      ? `Key factors: ${p.decisionFactors.join('. ')}.`
      : 'Scored based on coverage breadth and eligibility match.',
    strengthsForUser: p.coverageHighlights.slice(0, 5),
    risksOrGaps: p.gaps.slice(0, 4),
    comparisonNote: `Scored ${p.mlScore}/100 with ${p.matchLabel} match confidence.`,
  }))

  const defaultDimensions = [
    { dimension: 'Affordability', description: 'Cost relative to coverage' },
    { dimension: 'Drug Coverage', description: 'Prescription drug benefits' },
    { dimension: 'Dental & Vision', description: 'Dental and vision care' },
    { dimension: 'Mental Health', description: 'Mental health services' },
    { dimension: 'Coverage Breadth', description: 'Range of covered services' },
    { dimension: 'Accessibility', description: 'Ease of access and eligibility' },
  ]

  const fallbackRadarScores = mlResult.top3.map((p) => ({
    planName: p.planName,
    scores: [
      p.monthlyCostEstimate === 'No premium (publicly funded)' ? 95 : Math.max(10, 100 - Math.round(parseInt(p.monthlyCostEstimate.replace(/\D/g, '')) || 0) / 2),
      p.coverageHighlights.some((h) => h.toLowerCase().includes('drug')) ? 85 : 20,
      (p.coverageHighlights.some((h) => h.toLowerCase().includes('dental')) ? 40 : 0) + (p.coverageHighlights.some((h) => h.toLowerCase().includes('vision')) ? 40 : 0) + 10,
      p.coverageHighlights.some((h) => h.toLowerCase().includes('mental')) ? 85 : 20,
      Math.min(100, p.coverageHighlights.length * 15),
      p.eligibilityStatus === 'yes' ? 90 : p.eligibilityStatus === 'likely' ? 70 : 50,
    ],
  }))

  // Step 5: Combine deterministic viz data with LLM-generated or fallback radar chart
  const visualization: VisualizationDataset = {
    ...vizBase,
    radarChart: {
      dimensions: llmResult?.radarDimensions ?? defaultDimensions,
      plans: llmResult?.radarScores ?? fallbackRadarScores,
    },
  }

  return {
    narrative: llmResult?.narrativeSummary ?? fallbackNarrative,
    planExplanations: llmResult?.planExplanations ?? fallbackExplanations,
    visualization,
  }
}
