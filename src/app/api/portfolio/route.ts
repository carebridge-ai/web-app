import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'
import { loadUserPortfolio } from '@/lib/portfolio'

export const runtime = 'nodejs'

// ── GET — return full portfolio ───────────────────────────────────

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { portfolio: { profile: null, medical: null, recentMemories: [] } },
      { status: 200 },
    )
  }

  try {
    const portfolio = await loadUserPortfolio(session.user.id)
    return NextResponse.json({ portfolio })
  } catch {
    return NextResponse.json(
      { error: 'Failed to load portfolio.' },
      { status: 500 },
    )
  }
}

// ── PATCH — update individual fields ──────────────────────────────

const patchProfileSchema = z.object({
  province: z.string().optional(),
  immigrationStatus: z
    .enum([
      'citizen', 'permanent_resident', 'work_permit', 'student_visa',
      'refugee', 'asylum_seeker', 'undocumented', 'unknown',
    ])
    .optional(),
  residencyStartDate: z.string().optional(),
  ageBand: z
    .enum(['AGE_0_17', 'AGE_18_25', 'AGE_26_35', 'AGE_36_45', 'AGE_46_55', 'AGE_56_64', 'AGE_65_PLUS'])
    .optional(),
  employmentStatus: z
    .enum(['student', 'employed', 'self_employed', 'unemployed', 'retiree'])
    .optional(),
  hasEmployerBenefits: z.enum(['yes', 'no', 'unknown']).optional(),
  dependants: z.unknown().optional(),
  incomeBand: z.enum(['low', 'medium', 'high', 'prefer_not_to_say']).optional(),
  specialCategory: z
    .enum(['refugee', 'temp_foreign_worker', 'intl_student', 'asylum_seeker'])
    .nullable()
    .optional(),
  language: z.string().optional(),
})

const patchMedicalSchema = z.object({
  conditions: z.array(z.unknown()).optional(),
  medications: z.array(z.unknown()).optional(),
  allergies: z.array(z.unknown()).optional(),
  surgeries: z.array(z.unknown()).optional(),
  familyHistory: z.array(z.unknown()).optional(),
  riskFactors: z.array(z.unknown()).optional(),
})

const patchSchema = z.object({
  profile: patchProfileSchema.optional(),
  medical: patchMedicalSchema.optional(),
})

export async function PATCH(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid patch payload.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { profile: profilePatch, medical: medicalPatch } = parsed.data

  if (!profilePatch && !medicalPatch) {
    return NextResponse.json(
      { error: 'Provide at least one of "profile" or "medical" to update.' },
      { status: 400 },
    )
  }

  const userId = session.user.id

  try {
    // Update profile fields
    if (profilePatch && Object.keys(profilePatch).length > 0) {
      const updateData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(profilePatch)) {
        if (value !== undefined) {
          updateData[key] = value
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.profile.upsert({
          where: { userId },
          update: updateData,
          create: {
            userId,
            ...updateData,
            dependants: (updateData.dependants ?? { spouse: false, children: 0 }) as Prisma.InputJsonValue,
          },
        })
      }
    }

    // Update medical profile fields
    if (medicalPatch && Object.keys(medicalPatch).length > 0) {
      const updateData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(medicalPatch)) {
        if (value !== undefined) {
          updateData[key] = value
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.medicalProfile.upsert({
          where: { userId },
          update: updateData,
          create: {
            userId,
            conditions: (updateData.conditions ?? []) as Prisma.InputJsonValue,
            medications: (updateData.medications ?? []) as Prisma.InputJsonValue,
            allergies: (updateData.allergies ?? []) as Prisma.InputJsonValue,
            surgeries: (updateData.surgeries ?? []) as Prisma.InputJsonValue,
            familyHistory: (updateData.familyHistory ?? []) as Prisma.InputJsonValue,
            immunizations: [] as Prisma.InputJsonValue,
            labResults: [] as Prisma.InputJsonValue,
            riskFactors: (updateData.riskFactors ?? []) as Prisma.InputJsonValue,
          },
        })
      }
    }

    // Return updated portfolio
    const portfolio = await loadUserPortfolio(userId)
    return NextResponse.json({ ok: true, portfolio })
  } catch {
    return NextResponse.json(
      { error: 'Failed to update portfolio.' },
      { status: 500 },
    )
  }
}
