import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { computeCoverageScore } from '@/lib/coverage-score'

export const runtime = 'nodejs'

/**
 * GET /api/retention/score
 *
 * Returns the user's latest coverage score. If no score exists or the medical
 * profile has been updated since the last score, recomputes it.
 */
export async function GET() {
  const userId = await resolveUserId()

  if (!userId) {
    return NextResponse.json(
      { error: 'Sign in or provide a guest session to compute a coverage score.' },
      { status: 401 },
    )
  }

  try {
    // Check if we have a recent score
    const latestScore = await prisma.coverageScore.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    // Check medical profile last update
    const medicalProfile = await prisma.medicalProfile.findUnique({
      where: { userId },
      select: { lastUpdated: true },
    })

    if (!medicalProfile) {
      return NextResponse.json(
        { error: 'Complete your medical profile first to get a coverage score.' },
        { status: 404 },
      )
    }

    // Recompute if no score exists or medical profile was updated after last score
    const needsRecompute =
      !latestScore ||
      medicalProfile.lastUpdated > latestScore.createdAt

    if (needsRecompute) {
      const result = await computeCoverageScore(userId)
      return NextResponse.json({ ok: true, ...result })
    }

    // Return cached score
    return NextResponse.json({
      ok: true,
      overallScore: latestScore.overallScore,
      categories: {
        hospital: latestScore.hospital,
        prescriptionDrugs: latestScore.prescriptionDrugs,
        dental: latestScore.dental,
        vision: latestScore.vision,
        mentalHealth: latestScore.mentalHealth,
        emergency: latestScore.emergency,
      },
      planId: latestScore.planId,
      planName: null, // not stored on the score row — client can look up if needed
      rationale: latestScore.rationale,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute coverage score.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function resolveUserId(): Promise<string | null> {
  // Try NextAuth session first
  const session = await auth()
  if (session?.user?.id) return session.user.id

  // Fall back to guest session — look up most recent conversation
  const cookieStore = await cookies()
  const guestCookie = cookieStore.get('guest')
  if (guestCookie?.value !== '1') return null

  const guestSessionId = cookieStore.get('carebridge.chat.guestSessionId')?.value
  if (!guestSessionId) return null

  const conversation = await prisma.chatConversation.findFirst({
    where: { guestSessionId },
    select: { userId: true },
    orderBy: { updatedAt: 'desc' },
  })

  return conversation?.userId ?? null
}
