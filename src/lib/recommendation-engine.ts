import 'server-only'

import { z } from 'zod'
import { generateStructuredObject } from '@/lib/llm-client'
import { prisma } from '@/lib/prisma'
import { searchCoverageDocs } from '@/lib/coverage-docs'
import type { UserProfile } from '@/lib/profile'
import type { MedicalMlFeatures } from '@/lib/medical-feature-pipeline'
import type { ExtractedPlanData, PlanMlFeatures } from '@/lib/plan-feature-pipeline'

const recommendationModel =
  process.env.CARE_CHAT_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b'

// ---------------------------------------------------------------------------
// Input: everything we know about the user
// ---------------------------------------------------------------------------

export type RecommendationInput = {
  profile: UserProfile
  medicalFeatures?: MedicalMlFeatures | null
  medications?: string[]
  preferredProviders?: string[]
  freeTextConcerns?: string
}

// ---------------------------------------------------------------------------
// Output: the final recommendation payload
// ---------------------------------------------------------------------------

const eligibilityRuleSchema = z.object({
  planName: z.string(),
  planType: z.string(),
  eligible: z.enum(['yes', 'likely', 'unlikely', 'no', 'unknown']),
  reason: z.string().describe('One sentence explaining why the user is or is not eligible'),
  actionRequired: z.string().nullable().describe('What the user needs to do to enroll or verify eligibility'),
})

const planRecommendationSchema = z.object({
  planName: z.string(),
  carrier: z.string(),
  planType: z.string(),
  rank: z.number().int().min(1),
  matchScore: z.number().int().min(0).max(100),
  eligibilityStatus: z.enum(['yes', 'likely', 'unlikely', 'no', 'unknown']),
  monthlyCostEstimate: z.string().describe('e.g. "$0 (publicly funded)" or "$45-$120/mo" or "Employer-paid"'),
  coverageHighlights: z.array(z.string()).min(1).max(5).describe('Top benefits relevant to this user'),
  gaps: z.array(z.string()).describe('Important things NOT covered that the user should know about'),
  personalizedExplanation: z.string().describe('2-3 sentences explaining why this plan is recommended for this specific user, in warm supportive language'),
  nextSteps: z.array(z.string()).min(1).max(4).describe('Concrete action items to enroll or learn more'),
})

const fullRecommendationSchema = z.object({
  greeting: z.string().describe('A warm, 1-2 sentence personalized greeting acknowledging the user situation'),
  situationSummary: z.string().describe('2-3 sentences summarizing what we understand about the user and their coverage needs'),
  eligibilityResults: z.array(eligibilityRuleSchema),
  recommendations: z.array(planRecommendationSchema).min(1).max(6),
  urgentNotes: z.array(z.string()).describe('Time-sensitive information (enrollment deadlines, waiting periods starting, IFHP changes)'),
  additionalResources: z.array(z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().nullable(),
  })).describe('Helpful links or resources specific to user situation'),
  disclaimer: z.string().describe('Brief legal/accuracy disclaimer'),
})

export type FullRecommendation = z.infer<typeof fullRecommendationSchema>
export type PlanRecommendation = z.infer<typeof planRecommendationSchema>

// ---------------------------------------------------------------------------
// Canadian eligibility rules (deterministic, pre-LLM)
// ---------------------------------------------------------------------------

type EligibilitySignal = {
  planType: string
  planName: string
  eligible: 'yes' | 'likely' | 'unlikely' | 'no' | 'unknown'
  reason: string
  actionRequired: string | null
}

function evaluateEligibilityRules(profile: UserProfile): EligibilitySignal[] {
  const signals: EligibilitySignal[] = []
  const { province, immigrationStatus, ageBand, employmentStatus, hasEmployerBenefits, incomeBand, specialCategory } = profile

  // --- Provincial health insurance (OHIP, RAMQ, MSP, etc.) ---
  const provincialPlanNames: Record<string, string> = {
    ON: 'OHIP (Ontario Health Insurance Plan)',
    QC: 'RAMQ (Régie de l\'assurance maladie du Québec)',
    BC: 'MSP (Medical Services Plan)',
    AB: 'AHCIP (Alberta Health Care Insurance Plan)',
    MB: 'Manitoba Health',
    SK: 'Saskatchewan Health',
    NS: 'MSI (Medical Services Insurance)',
    NB: 'Medicare (New Brunswick)',
    NL: 'MCP (Medical Care Plan)',
    PE: 'PEI Health Card',
    NT: 'NWT Health Care Plan',
    YT: 'Yukon Health Care Insurance',
    NU: 'Nunavut Health Care Plan',
  }

  const provincialName = provincialPlanNames[province] ?? `Provincial Health Plan (${province})`

  if (['citizen', 'permanent_resident'].includes(immigrationStatus)) {
    signals.push({
      planType: 'provincial_public',
      planName: provincialName,
      eligible: 'yes',
      reason: `As a ${immigrationStatus.replace('_', ' ')} in ${province}, you are eligible for provincial health coverage.`,
      actionRequired: 'Ensure your health card is active and up to date. New residents may face a waiting period of up to 3 months.',
    })
  } else if (immigrationStatus === 'work_permit') {
    signals.push({
      planType: 'provincial_public',
      planName: provincialName,
      eligible: 'likely',
      reason: 'Work permit holders are typically eligible for provincial health insurance, but coverage start dates and requirements vary by province.',
      actionRequired: `Apply for ${provincialName} with your work permit. Some provinces have a 3-month waiting period during which you should arrange private interim coverage.`,
    })
  } else if (immigrationStatus === 'student_visa') {
    const studentProvincial = ['AB', 'BC', 'SK', 'MB', 'NB', 'NL'].includes(province)
    signals.push({
      planType: 'provincial_public',
      planName: provincialName,
      eligible: studentProvincial ? 'likely' : 'unlikely',
      reason: studentProvincial
        ? `International students in ${province} may be eligible for provincial health coverage.`
        : `International students in ${province} are generally NOT covered by provincial health insurance and must arrange private coverage through their institution.`,
      actionRequired: studentProvincial
        ? 'Apply through your province with proof of enrollment and valid study permit.'
        : 'Check with your university/college — most institutions provide mandatory health insurance plans for international students.',
    })
  } else if (['refugee', 'asylum_seeker'].includes(immigrationStatus)) {
    signals.push({
      planType: 'provincial_public',
      planName: provincialName,
      eligible: 'likely',
      reason: 'Refugees and asylum seekers are generally eligible for provincial health coverage, though there may be processing delays.',
      actionRequired: 'Apply with your refugee claim documents. You are also eligible for IFHP coverage while waiting for provincial coverage to begin.',
    })
  } else {
    signals.push({
      planType: 'provincial_public',
      planName: provincialName,
      eligible: 'unknown',
      reason: 'Your eligibility for provincial health coverage depends on your immigration and residency status.',
      actionRequired: 'Contact your provincial health authority to determine eligibility based on your specific situation.',
    })
  }

  // --- Interim Federal Health Program (IFHP) ---
  if (['refugee', 'asylum_seeker'].includes(immigrationStatus) || specialCategory === 'refugee' || specialCategory === 'asylum_seeker') {
    signals.push({
      planType: 'temporary_coverage',
      planName: 'Interim Federal Health Program (IFHP)',
      eligible: 'yes',
      reason: 'As a refugee/asylum seeker, you are eligible for IFHP which covers basic and supplemental health services.',
      actionRequired: 'Register with IFHP through Immigration, Refugees and Citizenship Canada. Use the IFHP Provider Search tool to find registered providers. Note: as of May 1, 2026, co-payments apply to supplemental services ($4/prescription, 30% for other supplemental services).',
    })
  } else if (immigrationStatus === 'work_permit' && specialCategory === 'temp_foreign_worker') {
    signals.push({
      planType: 'temporary_coverage',
      planName: 'Interim Federal Health Program (IFHP)',
      eligible: 'unlikely',
      reason: 'IFHP is primarily for refugees and protected persons. Temporary foreign workers typically rely on provincial coverage or employer-provided insurance.',
      actionRequired: null,
    })
  }

  // --- Canadian Dental Care Plan (CDCP) ---
  const cdcpIncomeEligible = incomeBand === 'low' || incomeBand === 'medium'
  const cdcpAgeEligible = true // expanded eligibility

  if (['citizen', 'permanent_resident'].includes(immigrationStatus) && cdcpIncomeEligible && cdcpAgeEligible) {
    let copayNote = ''
    if (incomeBand === 'low') {
      copayNote = 'With lower income, CDCP may cover 100% of eligible dental services.'
    } else {
      copayNote = 'With moderate income, you may have a 40-60% co-payment on CDCP dental services.'
    }

    signals.push({
      planType: 'dental_public',
      planName: 'Canadian Dental Care Plan (CDCP)',
      eligible: 'likely',
      reason: `The CDCP helps Canadians without dental insurance access affordable dental care. ${copayNote}`,
      actionRequired: 'Apply through the Canada Revenue Agency or Service Canada. You must not have access to private dental insurance.',
    })
  }

  // --- Public Service Health Care Plan (PSHCP) ---
  if (employmentStatus === 'employed' && hasEmployerBenefits === 'yes') {
    signals.push({
      planType: 'federal_employee',
      planName: 'Employer Benefits / Public Service Health Care Plan',
      eligible: 'likely',
      reason: 'You indicated having employer benefits. If you are a federal public servant, you may be covered under the PSHCP. Otherwise, your employer likely provides a group health plan.',
      actionRequired: 'Check with your HR department about your specific plan details, coverage levels, and how to submit claims.',
    })
  }

  // --- Private insurance (Sunlife-type plans) ---
  const needsPrivateCoverage =
    immigrationStatus === 'student_visa' ||
    (immigrationStatus === 'work_permit' && hasEmployerBenefits !== 'yes') ||
    hasEmployerBenefits === 'no' ||
    employmentStatus === 'self_employed'

  if (needsPrivateCoverage) {
    signals.push({
      planType: 'private_individual',
      planName: 'Private Health Insurance (e.g. Sun Life, Manulife, Blue Cross)',
      eligible: 'yes',
      reason: 'Private health insurance can fill gaps not covered by provincial plans — including dental, vision, prescription drugs, and paramedical services.',
      actionRequired: 'Compare plans from major Canadian insurers. Consider your medication needs and preferred providers when choosing.',
    })
  }

  return signals
}

// ---------------------------------------------------------------------------
// Load extracted plans from the database
// ---------------------------------------------------------------------------

async function loadExtractedPlans(): Promise<{ plan: ExtractedPlanData; features: PlanMlFeatures }[]> {
  try {
    const rows = await prisma.extractedPlan.findMany({
      select: {
        extractedData: true,
        mlFeatures: true,
      },
    })

    return rows.map((row) => ({
      plan: row.extractedData as unknown as ExtractedPlanData,
      features: row.mlFeatures as unknown as PlanMlFeatures,
    }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Build the LLM context for the recommendation engine
// ---------------------------------------------------------------------------

function buildRecommendationContext(
  input: RecommendationInput,
  eligibilitySignals: EligibilitySignal[],
  extractedPlans: { plan: ExtractedPlanData; features: PlanMlFeatures }[],
  coverageDocExcerpts: string,
): string {
  const { profile, medicalFeatures, medications, preferredProviders, freeTextConcerns } = input

  const sections: string[] = []

  // User profile
  sections.push(`== USER PROFILE ==
Province: ${profile.province}
Immigration status: ${profile.immigrationStatus.replace(/_/g, ' ')}
Age band: ${profile.ageBand}
Employment: ${profile.employmentStatus.replace(/_/g, ' ')}
Employer benefits: ${profile.hasEmployerBenefits}
Income band: ${profile.incomeBand}
Dependants: ${profile.dependants.spouse ? 'Spouse' : 'No spouse'}, ${profile.dependants.children} child(ren)
Special category: ${profile.specialCategory ?? 'None'}
Language preference: ${profile.language}
Residency start: ${profile.residencyStartDate}`)

  // Medical context
  if (medicalFeatures) {
    sections.push(`== MEDICAL CONTEXT ==
Condition count: ${medicalFeatures.counts.conditionCount}
Chronic conditions: ${medicalFeatures.counts.chronicConditionCount}
Medications: ${medicalFeatures.counts.medicationCount}
Clinical risk: ${medicalFeatures.derivedIndicators.overallClinicalRisk}
Follow-up urgency: ${medicalFeatures.derivedIndicators.followUpUrgency}
Key flags: ${[
      medicalFeatures.conditionFlags.hasCardiometabolicDisease && 'cardiometabolic',
      medicalFeatures.conditionFlags.hasRespiratoryDisease && 'respiratory',
      medicalFeatures.conditionFlags.hasMentalHealthCondition && 'mental health',
      medicalFeatures.conditionFlags.hasCancerHistory && 'cancer history',
      medicalFeatures.medicationFlags.hasPolypharmacy && 'polypharmacy',
      medicalFeatures.medicationFlags.hasInsulinOrGlucoseLoweringTherapy && 'diabetes medication',
    ].filter(Boolean).join(', ') || 'None flagged'}`)
  }

  if (medications?.length) {
    sections.push(`== MEDICATIONS ==\n${medications.join(', ')}`)
  }

  if (preferredProviders?.length) {
    sections.push(`== PREFERRED PROVIDERS ==\n${preferredProviders.join(', ')}`)
  }

  if (freeTextConcerns) {
    sections.push(`== USER CONCERNS ==\n${freeTextConcerns}`)
  }

  // Eligibility signals (from rule engine)
  sections.push(`== ELIGIBILITY RULE RESULTS ==
${eligibilitySignals.map((s) => `- ${s.planName} [${s.planType}]: ${s.eligible} — ${s.reason}${s.actionRequired ? ` Action: ${s.actionRequired}` : ''}`).join('\n')}`)

  // Extracted plan data summaries
  if (extractedPlans.length > 0) {
    const planSummaries = extractedPlans.map((ep) => {
      const p = ep.plan
      const f = ep.features
      const coveredBenefits = p.benefits.filter((b) => b.covered).map((b) => b.category).join(', ')
      return `- ${p.planName} (${p.carrier}, ${p.planType})
    Jurisdiction: ${p.jurisdiction}
    Summary: ${p.summary}
    Benefits: ${coveredBenefits || 'See plan details'}
    Cost: Premium ${f.monthlyPremiumEstimate > 0 ? `$${f.monthlyPremiumEstimate}/mo` : 'N/A'}, Deductible $${f.deductible}, Coinsurance ${f.coinsuranceDefault}%
    Generosity: ${f.overallGenerosity}
    Best for: ${f.bestForProfile}
    Exclusions: ${p.exclusions.slice(0, 3).join('; ') || 'None listed'}`
    }).join('\n\n')

    sections.push(`== EXTRACTED PLAN DATABASE (${extractedPlans.length} plans) ==\n${planSummaries}`)
  }

  // Coverage document excerpts
  if (coverageDocExcerpts) {
    sections.push(`== RELEVANT COVERAGE DOCUMENTS ==\n${coverageDocExcerpts}`)
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Main recommendation function
// ---------------------------------------------------------------------------

export async function generateRecommendation(input: RecommendationInput): Promise<FullRecommendation> {
  // Step 1: Deterministic eligibility rules
  const eligibilitySignals = evaluateEligibilityRules(input.profile)

  // Step 2: Load extracted plan data from DB
  const extractedPlans = await loadExtractedPlans()

  // Step 3: Search coverage docs for relevant excerpts
  const searchQuery = buildSearchQuery(input)
  const coverageMatches = await searchCoverageDocs(searchQuery, 6).catch(() => [])
  const coverageDocExcerpts = coverageMatches
    .map((m, i) => `[Source ${i + 1}] ${m.title}\n${m.content.slice(0, 1200)}`)
    .join('\n\n')

  // Step 4: Build full context
  const context = buildRecommendationContext(input, eligibilitySignals, extractedPlans, coverageDocExcerpts)

  // Step 5: LLM generates the final recommendation
  const recommendation = await generateStructuredObject({
    model: recommendationModel,
    schema: fullRecommendationSchema,
    maxTokens: 4000,
    system: RECOMMENDATION_SYSTEM_PROMPT,
    prompt: `Generate a personalized healthcare coverage recommendation for this user.\n\n${context}`,
  })

  return recommendation
}

function buildSearchQuery(input: RecommendationInput): string {
  const parts: string[] = []

  // Province-specific coverage
  if (input.profile.province !== 'unknown') {
    parts.push(input.profile.province)
  }

  // Immigration-aware keywords
  if (['refugee', 'asylum_seeker'].includes(input.profile.immigrationStatus)) {
    parts.push('interim federal health program IFHP refugee coverage')
  } else if (input.profile.immigrationStatus === 'student_visa') {
    parts.push('international student health coverage')
  } else if (input.profile.immigrationStatus === 'work_permit') {
    parts.push('temporary resident health coverage work permit')
  }

  // Benefit-type keywords based on needs
  if (input.profile.hasEmployerBenefits === 'no' || input.profile.employmentStatus === 'self_employed') {
    parts.push('private health insurance individual plan')
  }

  if (input.profile.incomeBand === 'low') {
    parts.push('dental care plan CDCP low income')
  }

  if (input.medications?.length) {
    parts.push('prescription drug coverage formulary')
  }

  if (input.freeTextConcerns) {
    parts.push(input.freeTextConcerns.slice(0, 200))
  }

  return parts.join(' ') || 'health insurance coverage Canada'
}

const RECOMMENDATION_SYSTEM_PROMPT = `You are CareBridge AI, a compassionate and knowledgeable healthcare coverage advisor for people living in Canada.

Your role is to review ALL available information — the user's profile, their medical needs, pre-computed eligibility rules, extracted plan data from official documents, and coverage document excerpts — and produce a clear, actionable, personalized recommendation.

CRITICAL GUIDELINES:

1. EMPATHY FIRST: The user may be a newcomer, refugee, international student, or someone navigating an unfamiliar healthcare system. Use warm, supportive, plain language. Avoid jargon. Acknowledge their situation.

2. ACCURACY: Only recommend plans the user is actually eligible for based on the eligibility rule results. If eligibility is "unlikely" or "no", explain why clearly and suggest alternatives. Never fabricate coverage details.

3. CANADIAN CONTEXT: This is about Canadian healthcare. Reference provincial health plans (OHIP, RAMQ, MSP, etc.), federal programs (IFHP, CDCP, PSHCP), and Canadian private insurers (Sun Life, Manulife, Blue Cross). Do NOT reference US plans, ACA, Medicare (US), or Medicaid.

4. COMPLETENESS: Address ALL coverage layers the user needs:
   - Provincial health insurance (doctor visits, hospital)
   - Supplemental coverage (dental, vision, prescriptions, mental health)
   - Emergency/travel medical (if applicable)
   - Special programs (IFHP for refugees, CDCP for dental, university plans for students)

5. ACTIONABLE NEXT STEPS: Every recommendation must include concrete next steps — what to apply for, where to go, what documents to bring, and what deadlines to watch.

6. GAPS AND RISKS: Be honest about coverage gaps. If provincial health doesn't cover dental, say so. If there's a 3-month waiting period, warn about it and suggest interim coverage.

7. INCOME SENSITIVITY: If the user has low income, prioritize free or low-cost options. Don't lead with expensive private plans when public options exist.

8. DEPENDANTS: If the user has a spouse or children, factor family coverage into recommendations.

9. TIME-SENSITIVE NOTES: Include any urgent deadlines, upcoming policy changes (like IFHP co-payment changes effective May 1, 2026), or enrollment windows.

10. LANGUAGE: If the user's preferred language is not English, still output in English but note that resources may be available in their language.

Return ONLY valid JSON matching the requested schema. The greeting should feel human and warm, not clinical.`

// ---------------------------------------------------------------------------
// Lightweight version for chat integration
// ---------------------------------------------------------------------------

export async function getQuickEligibility(profile: UserProfile): Promise<EligibilitySignal[]> {
  return evaluateEligibilityRules(profile)
}
