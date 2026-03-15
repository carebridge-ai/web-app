import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

/**
 * POST /api/medical/share — generate a temporary 24-hour share link
 */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  // Verify medical profile exists
  const profile = await prisma.medicalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json(
      { error: 'No medical profile to share.' },
      { status: 404 },
    )
  }

  // Generate a URL-safe token
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await prisma.medicalShareLink.create({
    data: {
      userId: session.user.id,
      token,
      expiresAt,
    },
  })

  return NextResponse.json({
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
  })
}
