import 'server-only'

import { z } from 'zod'
import type { Prisma } from '@/generated/prisma'
import { generateStructuredObject } from '@/lib/llm-client'

const ingestionModel =
  process.env.PLAN_INGESTION_MODEL ?? process.env.MEDICAL_EXTRACTION_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b'

export const planZodSchema = z.object({
  planCode: z.string().min(1).describe('Stable unique identifier for the plan, slug-like if possible'),
  name: z.string().min(1),
  carrier: z.string().min(1),
  state: z.string().min(2).describe('Province, territory, or state abbreviation/name'),
  metalTier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  planType: z.enum(['HMO', 'PPO', 'EPO']),
  source: z.string().min(1).default('sunlife'),
  type: z.string().min(1).describe('Plan grouping such as private, employer, provincial, or federal'),
  monthlyPremium: z.number().int().min(0),
  annualDeductible: z.number().int().min(0),
  deductible: z.number().int().min(0),
  maxOutOfPocket: z.number().int().min(0),
  outOfPocketMax: z.number().int().min(0),
  coinsuranceRate: z.number().int().min(0).max(100),
  primaryCareCopay: z.number().int().min(0),
  specialistCopay: z.number().int().min(0),
  erCopay: z.number().int().min(0),
  drugCoverage: z.record(z.string(), z.unknown()).nullable(),
  coverageDetails: z.record(z.string(), z.unknown()).nullable(),
  eligibility: z.record(z.string(), z.unknown()).nullable(),
  features: z.record(z.string(), z.unknown()).nullable(),
  rawData: z.record(z.string(), z.unknown()).nullable(),
  formulary: z.record(z.string(), z.unknown()).default({}),
  providerNetwork: z.record(z.string(), z.unknown()).default({}),
})

export type IngestedPlan = z.infer<typeof planZodSchema>

const PLAN_INGESTION_SYSTEM_PROMPT = `You extract structured insurance plan records from Sun Life plan documents.

Rules:
1. Return only one normalized plan JSON object.
2. Use only evidence from the source text. If a value is missing, infer a safe default only when required by schema and note the uncertainty in rawData.ingestionNotes.
3. planCode must be stable and unique, using carrier + plan name + jurisdiction when possible.
4. source must be "sunlife" unless the document clearly indicates a different source.
5. deductible should mirror annualDeductible. outOfPocketMax should mirror maxOutOfPocket.
6. Keep detailed source-derived structures in drugCoverage, coverageDetails, eligibility, features, rawData, formulary, and providerNetwork.
7. For metalTier, choose the closest fit based on generosity when not explicit.
8. For planType, choose the closest network model from HMO, PPO, or EPO and explain the mapping in rawData.ingestionNotes when inferred.
9. Monetary values must be integer whole-dollar amounts. Percentages must be integers from 0 to 100.
10. rawData must include documentSummary and ingestionNotes.
`

export function planSchemaForPrompt() {
  return [
    '{',
    '  "planCode": "string",',
    '  "name": "string",',
    '  "carrier": "string",',
    '  "state": "string",',
    '  "metalTier": "bronze" | "silver" | "gold" | "platinum",',
    '  "planType": "HMO" | "PPO" | "EPO",',
    '  "source": "string",',
    '  "type": "string",',
    '  "monthlyPremium": "integer",',
    '  "annualDeductible": "integer",',
    '  "deductible": "integer",',
    '  "maxOutOfPocket": "integer",',
    '  "outOfPocketMax": "integer",',
    '  "coinsuranceRate": "integer 0-100",',
    '  "primaryCareCopay": "integer",',
    '  "specialistCopay": "integer",',
    '  "erCopay": "integer",',
    '  "drugCoverage": "object | null",',
    '  "coverageDetails": "object | null",',
    '  "eligibility": "object | null",',
    '  "features": "object | null",',
    '  "rawData": "object | null",',
    '  "formulary": "object",',
    '  "providerNetwork": "object"',
    '}',
  ].join('\n')
}

export async function extractPlanFromText(params: {
  fileName: string
  rawText: string
}): Promise<IngestedPlan> {
  const { fileName, rawText } = params

  if (!rawText.trim()) {
    throw new Error('No text could be extracted from the uploaded PDF.')
  }

  return generateStructuredObject({
    model: ingestionModel,
    schema: planZodSchema,
    system: PLAN_INGESTION_SYSTEM_PROMPT,
    prompt: [
      `Convert this Sun Life plan document into a Plan record.`,
      '',
      `File name: ${fileName}`,
      '',
      'Plan Zod schema JSON Schema:',
      planSchemaForPrompt(),
      '',
      'Document text:',
      '--- BEGIN DOCUMENT ---',
      rawText.slice(0, 30_000),
      '--- END DOCUMENT ---',
    ].join('\n'),
    maxTokens: 5000,
  })
}

export function toPlanUpsertData(plan: IngestedPlan) {
  const input = JSON.parse(JSON.stringify(plan)) as Prisma.InputJsonValue

  return {
    where: { planCode: plan.planCode },
    create: {
      ...plan,
      drugCoverage: plan.drugCoverage as Prisma.InputJsonValue | undefined,
      coverageDetails: plan.coverageDetails as Prisma.InputJsonValue | undefined,
      eligibility: plan.eligibility as Prisma.InputJsonValue | undefined,
      features: plan.features as Prisma.InputJsonValue | undefined,
      rawData: input,
      formulary: plan.formulary as Prisma.InputJsonValue,
      providerNetwork: plan.providerNetwork as Prisma.InputJsonValue,
    },
    update: {
      ...plan,
      drugCoverage: plan.drugCoverage as Prisma.InputJsonValue | undefined,
      coverageDetails: plan.coverageDetails as Prisma.InputJsonValue | undefined,
      eligibility: plan.eligibility as Prisma.InputJsonValue | undefined,
      features: plan.features as Prisma.InputJsonValue | undefined,
      rawData: input,
      formulary: plan.formulary as Prisma.InputJsonValue,
      providerNetwork: plan.providerNetwork as Prisma.InputJsonValue,
    },
  }
}
