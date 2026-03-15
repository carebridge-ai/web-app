import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/medical/wallet — return the user's full medical profile
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const profile = await prisma.medicalProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!profile) {
    return NextResponse.json({ error: 'No medical profile found.' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    profile: {
      conditions: profile.conditions,
      medications: profile.medications,
      allergies: profile.allergies,
      surgeries: profile.surgeries,
      familyHistory: profile.familyHistory,
      immunizations: profile.immunizations,
      labResults: profile.labResults,
      riskFactors: profile.riskFactors,
      confidence: profile.confidence,
      lastUpdated: profile.lastUpdated,
    },
  })
}

/**
 * PATCH /api/medical/wallet — update a specific section of the medical profile
 */
const patchSchema = z.object({
  section: z.enum([
    'conditions',
    'medications',
    'allergies',
    'surgeries',
    'familyHistory',
    'immunizations',
    'labResults',
    'riskFactors',
  ]),
  items: z.array(z.record(z.string(), z.unknown())),
})

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { section, items } = parsed.data

  await prisma.medicalProfile.update({
    where: { userId: session.user.id },
    data: {
      [section]: items,
      lastUpdated: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
