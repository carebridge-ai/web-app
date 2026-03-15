import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import {
  logLifeEvent,
  processLifeEvents,
  LIFE_EVENT_TYPES,
  type LifeEventType,
} from '@/lib/life-events'

export const runtime = 'nodejs'

const postSchema = z.object({
  eventType: z.enum(LIFE_EVENT_TYPES),
  description: z.string().optional(),
  eventDate: z.string().datetime().optional(),
})

/**
 * POST /api/retention/events — log a life event and process it
 */
export async function POST(request: Request) {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { eventType, description, eventDate } = parsed.data

  // Log the event
  const event = await logLifeEvent(
    userId,
    eventType as LifeEventType,
    description,
    eventDate ? new Date(eventDate) : undefined,
  )

  // Process immediately — recompute score
  const result = await processLifeEvents(userId)

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    processed: result.processed,
    coverageScore: result.coverageScore,
  })
}

/**
 * GET /api/retention/events — list user's life events
 */
export async function GET() {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const events = await prisma.lifeEvent.findMany({
    where: { userId },
    orderBy: { eventDate: 'desc' },
    take: 20,
  })

  return NextResponse.json({ ok: true, events })
}

async function resolveUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}
