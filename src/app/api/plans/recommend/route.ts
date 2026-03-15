import { NextResponse } from 'next/server'
import { z } from 'zod'
import { searchPlans, normalizeCmsPlan, type CmsPlan, type NormalizedPlan } from '@/lib/cms-marketplace'
import { searchProviders, normalizeProvider } from '@/lib/npi-registry'
import { lookupDrug, type DrugLookupResult } from '@/lib/rxnorm-client'
import { generateChatText } from '@/lib/llm-client'
import { prisma } from '@/lib/prisma'
import { MetalTier, PlanType } from '@/generated/prisma'
import { lookupStateByZip } from '@/lib/zip-county'

export const runtime = 'nodejs'

const schema = z.object({
  zip: z.string().min(5).max(5),
  age: z.number().int().positive().optional().default(30),
  income: z.number().positive().optional(),
  householdSize: z.number().int().positive().optional().default(1),
  medications: z.array(z.string()).optional().default([]),
  providers: z.array(z.string()).optional().default([]),
  maxMonthlyPremium: z.number().positive().optional(),
  usesTobacco: z.boolean().optional().default(false),
})

/**
 * Parse a provider search string into first/last name or org name.
 */
function parseProviderQuery(query: string) {
  const trimmed = query.trim()

  // If it contains "Dr." or has two+ words that look like a person name
  const drMatch = trimmed.match(/^(?:Dr\.?\s+)?(\w+)\s+(.+)/i)
  if (drMatch) {
    return { firstName: drMatch[1], lastName: drMatch[2] }
  }

  // Likely an organization name
  return { organizationName: trimmed }
}

function ageBandFromAge(age: number): string {
  if (age < 18) return 'AGE_0_17'
  if (age <= 25) return 'AGE_18_25'
  if (age <= 35) return 'AGE_26_35'
  if (age <= 45) return 'AGE_36_45'
  if (age <= 55) return 'AGE_46_55'
  if (age <= 64) return 'AGE_56_64'
  return 'AGE_65_PLUS'
}

function incomeBandFromIncome(income: number): string {
  if (income < 25000) return 'low'
  if (income <= 60000) return 'medium'
  return 'high'
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.flatten() }, { status: 400 })
  }

  const { zip, age, income, householdSize, medications, providers, maxMonthlyPremium, usesTobacco } = parsed.data

  try {
    // Run all API calls in parallel
    const [cmsResult, drugResults, providerResults] = await Promise.all([
      // 1. CMS Marketplace — search plans by ZIP
      searchPlans({
        zipCode: zip,
        income,
        people: [{ age, uses_tobacco: usesTobacco }],
        limit: 10,
      }).catch((err) => {
        console.error('CMS API error:', err)
        return { plans: [] as never[], total: 0 }
      }),

      // 2. RxNorm + OpenFDA — look up each medication
      Promise.all(
        medications.slice(0, 5).map(async (med): Promise<DrugLookupResult> => {
          try {
            return await lookupDrug(med)
          } catch {
            return {
              query: med,
              rxcui: null,
              normalizedName: med,
              brandNames: [],
              genericNames: [],
              purpose: null,
              warnings: [],
              interactions: [],
            }
          }
        })
      ),

      // 3. NPI Registry — look up each provider
      Promise.all(
        providers.slice(0, 3).map((prov) => {
          const params = parseProviderQuery(prov)
          return searchProviders({ ...params, postalCode: zip, limit: 3 }).catch(() => ({
            result_count: 0,
            results: [],
          }))
        })
      ),
    ])

    // Normalize CMS plans
    const normalizedPlans = cmsResult.plans.map(normalizeCmsPlan)
    await persistCmsPlans(cmsResult.plans, normalizedPlans, zip)

    // Filter by budget if specified
    const filteredPlans = maxMonthlyPremium
      ? normalizedPlans.filter((p) => p.monthlyPremium <= maxMonthlyPremium)
      : normalizedPlans

    // Normalize provider results
    const foundProviders = providerResults.flatMap((r) =>
      r.results.slice(0, 2).map(normalizeProvider)
    )

    // --- ML service: compute user feature vector and get ML scores ---
    let mlScoredPlans = filteredPlans
    let mlScores: Record<string, { probability: number; suitabilityClass: number; suitabilityLabel: string }> = {}

    if (filteredPlans.length > 0) {
      try {
        const mlResponse = await fetch(
          `${process.env.ML_SERVICE_URL ?? 'http://localhost:8000'}/predict`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile: {
                ageBand: ageBandFromAge(age),
                province: lookupStateByZip(zip) ?? 'unknown',
                incomeBand: income ? incomeBandFromIncome(income) : 'medium',
                employmentStatus: 'employed',
                hasEmployerBenefits: 'unknown',
                immigrationStatus: 'citizen',
                dependants: Array.from({ length: householdSize - 1 }, () => 'dependent'),
              },
              plan_ids: filteredPlans.map((p) => p.id),
            }),
            signal: AbortSignal.timeout(5000),
          }
        )

        if (mlResponse.ok) {
          const mlData = (await mlResponse.json()) as {
            all_scores: Array<{
              plan_id: string
              probability: number
              suitability_class: number
              suitability_label: string
            }>
          }

          for (const s of mlData.all_scores) {
            mlScores[s.plan_id] = {
              probability: s.probability,
              suitabilityClass: s.suitability_class,
              suitabilityLabel: s.suitability_label,
            }
          }

          // Sort plans by ML probability, take top 10 for LLM ranking
          mlScoredPlans = [...filteredPlans].sort((a, b) => {
            const scoreA = mlScores[a.id]?.probability ?? 0
            const scoreB = mlScores[b.id]?.probability ?? 0
            return scoreB - scoreA
          }).slice(0, 10)
        }
      } catch (mlErr) {
        // ML service unavailable — fall through to LLM-only ranking
        console.warn('ML service unavailable, falling back to LLM-only ranking:', mlErr)
      }
    }

    // Build LLM context for personalized ranking (using ML-filtered top 10)
    const llmContext = buildLlmContext({
      plans: mlScoredPlans,
      drugs: drugResults,
      providers: foundProviders,
      zip,
      age,
      income,
      householdSize,
    })

    // Ask Groq to rank and explain the ML-selected top plans
    let recommendations: RankedRecommendation[] = []

    if (mlScoredPlans.length > 0) {
      recommendations = await generateRecommendations(llmContext, mlScoredPlans)

      // Blend ML scores into the final output
      recommendations = recommendations.map((rec) => {
        const ml = mlScores[rec.id]
        if (ml) {
          return {
            ...rec,
            score: Math.round(rec.score * 0.6 + ml.probability * 100 * 0.4),
            matchReasons: [
              ...rec.matchReasons,
              `ML suitability: ${ml.suitabilityLabel} (${Math.round(ml.probability * 100)}%)`,
            ],
          }
        }
        return rec
      }).sort((a, b) => b.score - a.score)
    }

    // --- What-if scenarios: generate based on user's conditions & top plans ---
    const top3Plans = recommendations.length > 0
      ? recommendations.slice(0, 3)
      : filteredPlans.slice(0, 3).map((p) => ({
          ...p,
          score: 0,
          matchReasons: ['Matches your ZIP code and budget filters'],
          explanation: 'This plan is available in your area.',
        }))

    let scenarios: WhatIfScenario[] = []
    if (top3Plans.length > 0) {
      scenarios = await generateWhatIfScenarios(
        llmContext,
        top3Plans.map((p) => p.name),
        drugResults.map((d) => d.normalizedName),
      ).catch(() => [])
    }

    return NextResponse.json({
      ok: true,
      plans: top3Plans,
      scenarios,
      drugInfo: drugResults.map((d) => ({
        query: d.query,
        normalizedName: d.normalizedName,
        brandNames: d.brandNames,
        purpose: d.purpose,
        interactionCount: d.interactions.length,
      })),
      providerInfo: foundProviders,
      totalPlansAvailable: cmsResult.total,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch recommendations.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type RankedRecommendation = NormalizedPlan & {
  score: number
  matchReasons: string[]
  explanation: string
}

type WhatIfScenario = {
  scenario: string
  plans: Array<{ planName: string; coveragePct: number }>
}

function mapMetalTier(level: string | null | undefined): MetalTier {
  const normalized = (level ?? '').toLowerCase()
  switch (normalized) {
    case 'bronze':
      return MetalTier.bronze
    case 'silver':
      return MetalTier.silver
    case 'gold':
      return MetalTier.gold
    case 'platinum':
      return MetalTier.platinum
    default:
      return MetalTier.silver
  }
}

function mapPlanType(type: string | null | undefined): PlanType {
  const normalized = (type ?? '').toUpperCase()
  if (normalized.includes('HMO')) return PlanType.HMO
  if (normalized.includes('PPO')) return PlanType.PPO
  if (normalized.includes('EPO')) return PlanType.EPO
  if (normalized.includes('POS')) return PlanType.PPO
  return PlanType.PPO
}

function normalizeCoinsuranceRate(rate: number | null | undefined) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return 0
  const normalized = rate <= 1 ? rate * 100 : rate
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function findCopay(benefits: NormalizedPlan['benefits'], keywords: string[]) {
  const matches = benefits.find((benefit) => {
    const name = benefit.name.toLowerCase()
    return keywords.some((keyword) => name.includes(keyword))
  })
  return Math.max(0, Math.round(matches?.copay ?? 0))
}

function findCoinsurance(benefits: NormalizedPlan['benefits']) {
  const match = benefits.find((benefit) => typeof benefit.coinsurance === 'number')
  return normalizeCoinsuranceRate(match?.coinsurance ?? 0)
}

function resolvePlanState(plan: CmsPlan, zip: string) {
  const candidate = (plan as { state?: string; state_code?: string }) ?? {}
  const planState = candidate.state ?? candidate.state_code
  if (planState) return planState.toString()
  return lookupStateByZip(zip) ?? 'unknown'
}

async function persistCmsPlans(plans: CmsPlan[], normalizedPlans: NormalizedPlan[], zip: string) {
  if (!plans.length) return

  const normalizedById = new Map(normalizedPlans.map((plan) => [plan.id, plan]))

  await Promise.all(
    plans.map(async (plan) => {
      const normalized = normalizedById.get(plan.id)
      if (!normalized) return

      const copays = {
        primary: findCopay(normalized.benefits, ['primary care', 'pcp']),
        specialist: findCopay(normalized.benefits, ['specialist']),
        er: findCopay(normalized.benefits, ['emergency', 'er']),
      }

      const planCode = `cms:${plan.id}`

      await prisma.plan.upsert({
        where: { planCode },
        create: {
          planCode,
          name: normalized.name,
          carrier: normalized.carrier,
          state: resolvePlanState(plan, zip),
          metalTier: mapMetalTier(plan.metal_level),
          planType: mapPlanType(plan.type),
          source: 'cms',
          type: 'private',
          monthlyPremium: Math.round(normalized.monthlyPremium ?? 0),
          annualDeductible: Math.round(normalized.deductible ?? 0),
          deductible: Math.round(normalized.deductible ?? 0),
          maxOutOfPocket: Math.round(normalized.maxOutOfPocket ?? 0),
          outOfPocketMax: Math.round(normalized.maxOutOfPocket ?? 0),
          coinsuranceRate: findCoinsurance(normalized.benefits),
          primaryCareCopay: copays.primary,
          specialistCopay: copays.specialist,
          erCopay: copays.er,
          drugCoverage: plan.formulary_url ? { formularyUrl: plan.formulary_url } : null,
          coverageDetails: {
            benefits: normalized.benefits,
            qualityRating: normalized.qualityRating,
            brochureUrl: normalized.brochureUrl,
            providerDirectoryUrl: normalized.providerDirectoryUrl,
            formularyUrl: normalized.formularyUrl,
          },
          eligibility: { zip },
          features: null,
          rawData: {
            source: 'cms',
            externalId: plan.id,
            fetchedAt: new Date().toISOString(),
            plan,
          },
          formulary: plan.formulary_url ? { url: plan.formulary_url } : {},
          providerNetwork: plan.provider_directory_url ? { url: plan.provider_directory_url } : {},
        },
        update: {
          name: normalized.name,
          carrier: normalized.carrier,
          state: resolvePlanState(plan, zip),
          metalTier: mapMetalTier(plan.metal_level),
          planType: mapPlanType(plan.type),
          source: 'cms',
          type: 'private',
          monthlyPremium: Math.round(normalized.monthlyPremium ?? 0),
          annualDeductible: Math.round(normalized.deductible ?? 0),
          deductible: Math.round(normalized.deductible ?? 0),
          maxOutOfPocket: Math.round(normalized.maxOutOfPocket ?? 0),
          outOfPocketMax: Math.round(normalized.maxOutOfPocket ?? 0),
          coinsuranceRate: findCoinsurance(normalized.benefits),
          primaryCareCopay: copays.primary,
          specialistCopay: copays.specialist,
          erCopay: copays.er,
          drugCoverage: plan.formulary_url ? { formularyUrl: plan.formulary_url } : null,
          coverageDetails: {
            benefits: normalized.benefits,
            qualityRating: normalized.qualityRating,
            brochureUrl: normalized.brochureUrl,
            providerDirectoryUrl: normalized.providerDirectoryUrl,
            formularyUrl: normalized.formularyUrl,
          },
          eligibility: { zip },
          features: null,
          rawData: {
            source: 'cms',
            externalId: plan.id,
            fetchedAt: new Date().toISOString(),
            plan,
          },
          formulary: plan.formulary_url ? { url: plan.formulary_url } : {},
          providerNetwork: plan.provider_directory_url ? { url: plan.provider_directory_url } : {},
        },
      })
    })
  )
}

function buildLlmContext(params: {
  plans: NormalizedPlan[]
  drugs: DrugLookupResult[]
  providers: Array<ReturnType<typeof normalizeProvider>>
  zip: string
  age: number
  income?: number
  householdSize: number
}) {
  const planSummaries = params.plans.map((p, i) => {
    const benefits = p.benefits
      .filter((b) => b.covered)
      .slice(0, 5)
      .map((b) => `${b.name}: $${b.copay ?? 0} copay`)
      .join(', ')

    return `Plan ${i + 1}: ${p.name} (${p.carrier})
  Tier: ${p.metalTier}, Type: ${p.planType}
  Premium: $${p.monthlyPremium}/mo, Deductible: $${p.deductible}, Max OOP: $${p.maxOutOfPocket}
  Key benefits: ${benefits || 'See brochure'}
  Rating: ${p.qualityRating ? `${p.qualityRating}/5` : 'Not rated'}`
  })

  const drugSummaries = params.drugs.map((d) => {
    const interactions = d.interactions.length
      ? `Interactions: ${d.interactions.map((i) => i.interactingDrug).join(', ')}`
      : 'No known interactions'
    return `${d.normalizedName} (searched: "${d.query}") — ${d.purpose ?? 'Purpose not found'}. ${interactions}`
  })

  const providerSummaries = params.providers.map((p) =>
    `${p.name}${p.credential ? `, ${p.credential}` : ''} — ${p.specialty ?? 'General'}, ${p.address?.city ?? ''} ${p.address?.state ?? ''} ${p.address?.zip ?? ''}`
  )

  return `User profile:
- ZIP: ${params.zip}, Age: ${params.age}, Household: ${params.householdSize}
${params.income ? `- Annual income: $${params.income}` : '- Income: not provided'}

Medications the user takes:
${drugSummaries.length ? drugSummaries.join('\n') : 'None specified'}

Providers the user wants to keep:
${providerSummaries.length ? providerSummaries.join('\n') : 'None specified'}

Available plans:
${planSummaries.join('\n\n')}`
}

async function generateRecommendations(
  context: string,
  plans: NormalizedPlan[],
): Promise<RankedRecommendation[]> {
  const text = await generateChatText({
    system: `You are a healthcare plan advisor. Given a user's profile, medications, providers, and available insurance plans, rank the plans from best to worst fit.

For each plan, provide:
1. A score from 0-100 (higher = better fit)
2. 1-3 specific match reasons (e.g., "Low deductible suits your medication needs")
3. A 1-2 sentence personalized explanation

Return ONLY valid JSON in this exact format (no markdown, no commentary):
[
  {
    "planIndex": 0,
    "score": 85,
    "matchReasons": ["reason1", "reason2"],
    "explanation": "..."
  }
]

Consider: medication coverage likelihood (based on plan tier and formulary), provider network breadth for the plan type (HMO vs PPO), premium affordability relative to income, deductible and out-of-pocket exposure, quality ratings.`,
    messages: [
      {
        role: 'user',
        content: `Rank these plans for me:\n\n${context}`,
      },
    ],
    maxTokens: 1500,
  })

  try {
    // Strip any markdown fencing or reasoning blocks
    const cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start < 0 || end < 0) throw new Error('No JSON array found')

    const rankings = JSON.parse(cleaned.slice(start, end + 1)) as Array<{
      planIndex: number
      score: number
      matchReasons: string[]
      explanation: string
    }>

    // Merge rankings back into plans
    return rankings
      .filter((r) => r.planIndex >= 0 && r.planIndex < plans.length)
      .sort((a, b) => b.score - a.score)
      .map((r) => ({
        ...plans[r.planIndex],
        score: r.score,
        matchReasons: r.matchReasons,
        explanation: r.explanation,
      }))
  } catch {
    // LLM returned unparseable response — return plans unranked
    return plans.map((p, i) => ({
      ...p,
      score: plans.length - i,
      matchReasons: ['Available in your area'],
      explanation: 'This plan matches your ZIP code and filters.',
    }))
  }
}

async function generateWhatIfScenarios(
  context: string,
  planNames: string[],
  medications: string[],
): Promise<WhatIfScenario[]> {
  const medsClause = medications.length
    ? `The user takes these medications: ${medications.join(', ')}.`
    : 'The user has not listed specific medications.'

  const text = await generateChatText({
    system: `You are a healthcare coverage advisor. Given a user's profile and their top insurance plans, generate exactly 3 what-if medical scenarios that are specifically relevant to this user's medications, age, and health situation. Do NOT use generic scenarios — tailor them to the user's actual conditions and drugs.

For each scenario, estimate what percentage of the cost each plan would likely cover (0-100).

Return ONLY valid JSON in this exact format (no markdown, no commentary):
[
  {
    "scenario": "A specific medical situation relevant to this user",
    "plans": [
      { "planName": "Exact Plan Name", "coveragePct": 85 }
    ]
  }
]

Each scenario's "plans" array must include all ${planNames.length} plans. Use the exact plan names provided.`,
    messages: [
      {
        role: 'user',
        content: `${context}

${medsClause}

The top plans are: ${planNames.map((n, i) => `${i + 1}. ${n}`).join(', ')}

Generate 3 what-if scenarios tailored to this user's health profile.`,
      },
    ],
    maxTokens: 1000,
  })

  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0) return []

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Array<{
    scenario: string
    plans: Array<{ planName: string; coveragePct: number }>
  }>

  // Validate and clamp
  return parsed.slice(0, 3).map((s) => ({
    scenario: s.scenario,
    plans: (s.plans ?? []).map((p) => ({
      planName: p.planName,
      coveragePct: Math.max(0, Math.min(100, Math.round(p.coveragePct))),
    })),
  }))
}
