import 'server-only'

import { prisma } from '@/lib/prisma'
import { computeCoverageScore, type CoverageScoreResult } from '@/lib/coverage-score'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const LIFE_EVENT_TYPES = [
  'job_change',
  'new_baby',
  'marriage',
  'move',
  'birthday',
  'lost_coverage',
] as const

export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number]

export const EVENT_LABELS: Record<LifeEventType, string> = {
  job_change: 'Job change',
  new_baby: 'New baby',
  marriage: 'Marriage',
  move: 'Move',
  birthday: 'Birthday',
  lost_coverage: 'Lost coverage',
}

/** Profile field updates implied by each event type */
const EVENT_PROFILE_EFFECTS: Partial<
  Record<LifeEventType, (userId: string) => Promise<void>>
> = {
  new_baby: async (userId) => {
    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile) return
    const deps = Array.isArray(profile.dependants) ? profile.dependants : []
    await prisma.profile.update({
      where: { userId },
      data: { dependants: [...deps, 'child'] },
    })
  },
  marriage: async (userId) => {
    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile) return
    const deps = Array.isArray(profile.dependants) ? profile.dependants : []
    if (!deps.includes('spouse')) {
      await prisma.profile.update({
        where: { userId },
        data: { dependants: [...deps, 'spouse'] },
      })
    }
  },
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function logLifeEvent(
  userId: string,
  eventType: LifeEventType,
  description?: string,
  eventDate?: Date,
): Promise<{ id: string }> {
  const event = await prisma.lifeEvent.create({
    data: {
      userId,
      eventType,
      description: description ?? null,
      eventDate: eventDate ?? new Date(),
    },
  })

  return { id: event.id }
}

/**
 * Process all unprocessed life events for a user:
 * 1. Apply profile side-effects (e.g. add dependent for new_baby)
 * 2. Recompute coverage score
 * 3. Mark events as processed
 *
 * Returns the new coverage score if any events were processed.
 */
export async function processLifeEvents(
  userId: string,
): Promise<{ processed: number; coverageScore: CoverageScoreResult | null }> {
  const unprocessed = await prisma.lifeEvent.findMany({
    where: { userId, processed: false },
    orderBy: { eventDate: 'asc' },
  })

  if (unprocessed.length === 0) {
    return { processed: 0, coverageScore: null }
  }

  // 1. Apply profile side-effects for each event
  for (const event of unprocessed) {
    const effect = EVENT_PROFILE_EFFECTS[event.eventType as LifeEventType]
    if (effect) {
      await effect(userId)
    }
  }

  // 2. Recompute coverage score
  let coverageScore: CoverageScoreResult | null = null
  try {
    coverageScore = await computeCoverageScore(userId)
  } catch {
    // Medical profile may not exist yet — that's okay
  }

  // 3. Mark all as processed
  await prisma.lifeEvent.updateMany({
    where: {
      id: { in: unprocessed.map((e) => e.id) },
    },
    data: {
      processed: true,
      processedAt: new Date(),
    },
  })

  return { processed: unprocessed.length, coverageScore }
}
