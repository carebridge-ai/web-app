import { NextResponse } from 'next/server'
import {
  checkCoverageGaps,
  checkLifeEventCheckins,
  checkEnrollmentCountdown,
} from '@/lib/notifications'

export const runtime = 'nodejs'

/**
 * GET /api/cron/notifications
 *
 * Daily cron endpoint that checks for users needing notifications.
 * Protected by a bearer token to prevent unauthorized access.
 *
 * Set CRON_SECRET in your environment and call with:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const results = {
    coverageGapAlerts: 0,
    lifeEventCheckins: 0,
    enrollmentCountdowns: 0,
    errors: [] as string[],
  }

  // Run all checks
  try {
    results.coverageGapAlerts = await checkCoverageGaps()
  } catch (err) {
    results.errors.push(`Coverage gaps: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  try {
    results.lifeEventCheckins = await checkLifeEventCheckins()
  } catch (err) {
    results.errors.push(`Life event check-ins: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  try {
    results.enrollmentCountdowns = await checkEnrollmentCountdown()
  } catch (err) {
    results.errors.push(`Enrollment countdown: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  const totalSent =
    results.coverageGapAlerts +
    results.lifeEventCheckins +
    results.enrollmentCountdowns

  return NextResponse.json({
    ok: true,
    sent: totalSent,
    ...results,
    timestamp: new Date().toISOString(),
  })
}
