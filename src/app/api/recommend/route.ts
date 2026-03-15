import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { generateRecommendation, getQuickEligibility } from '@/lib/recommendation-engine'
import type { UserProfile } from '@/lib/profile'

export const runtime = 'nodejs'
export const maxDuration = 120

const profileSchema = z.object({
  province: z.string(),
  immigrationStatus: z.enum([
    'citizen', 'permanent_resident', 'work_permit', 'student_visa',
    'refugee', 'asylum_seeker', 'undocumented', 'unknown',
  ]),
  residencyStartDate: z.string(),
  ageBand: z.enum(['0-17', '18-25', '26-35', '36-45', '46-55', '56-64', '65+']),
  employmentStatus: z.enum(['student', 'employed', 'self_employed', 'unemployed', 'retiree']),
  hasEmployerBenefits: z.enum(['yes', 'no', 'unknown']),
  dependants: z.object({ spouse: z.boolean(), children: z.number().int().min(0) }),
  incomeBand: z.enum(['low', 'medium', 'high', 'prefer_not_to_say']),
  specialCategory: z.enum(['refugee', 'temp_foreign_worker', 'intl_student', 'asylum_seeker']).nullable(),
  language: z.string().default('en'),
})

const requestSchema = z.object({
  profile: profileSchema,
  medications: z.array(z.string()).optional().default([]),
  preferredProviders: z.array(z.string()).optional().default([]),
  freeTextConcerns: z.string().optional(),
  mode: z.enum(['full', 'eligibility_only']).optional().default('full'),
})

/**
 * POST /api/recommend
 *
 * The final recommendation engine. Takes user profile + optional medical context
 * and returns personalized, ranked plan recommendations with explanations.
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

    const { profile, medications, preferredProviders, freeTextConcerns, mode } = parsed.data
    const userProfile = profile as UserProfile

    // Quick eligibility mode — no LLM call, just deterministic rules
    if (mode === 'eligibility_only') {
      const eligibility = await getQuickEligibility(userProfile)
      return NextResponse.json({ ok: true, mode: 'eligibility_only', eligibility })
    }

    // Full recommendation mode
    const recommendation = await generateRecommendation({
      profile: userProfile,
      medications,
      preferredProviders,
      freeTextConcerns,
    })

    return NextResponse.json({
      ok: true,
      mode: 'full',
      recommendation,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recommendation engine failed.'
    console.error('[recommend] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
