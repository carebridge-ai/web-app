import 'server-only'

import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const resend = new Resend(process.env.RESEND_API_KEY ?? '')
const FROM_ADDRESS = process.env.NOTIFICATION_FROM ?? 'CareBridge AI <notifications@carebridge.ai>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'coverage_gap_alert'
  | 'life_event_checkin'
  | 'enrollment_countdown'

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function coverageGapAlertHtml(name: string, gaps: string[], score: number): string {
  const gapList = gaps.map((g) => `<li style="margin-bottom:4px;">${g}</li>`).join('')
  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2C1810;">
  <p style="font-size:14px;color:#8B7355;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;">CareBridge AI</p>
  <h1 style="font-size:24px;font-style:italic;margin:0 0 16px;">Coverage gap detected</h1>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">Hi ${name || 'there'},</p>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">
    Your current coverage score is <strong>${score}/100</strong>. We found gaps in the following areas:
  </p>
  <ul style="font-size:14px;line-height:1.7;color:#5C4033;padding-left:20px;">${gapList}</ul>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">
    Review your options to improve your coverage.
  </p>
  <a href="${APP_URL}/chat" style="display:inline-block;padding:12px 24px;background:#1C1210;color:#FAF0E4;border-radius:12px;font-size:14px;text-decoration:none;margin-top:8px;">
    Review your plans
  </a>
  <p style="font-size:11px;color:#B8A690;margin-top:24px;line-height:1.5;">
    This is not medical advice. CareBridge AI provides estimates only.
  </p>
</div>`
}

function lifeEventCheckinHtml(name: string, daysSinceLastEvent: number): string {
  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2C1810;">
  <p style="font-size:14px;color:#8B7355;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;">CareBridge AI</p>
  <h1 style="font-size:24px;font-style:italic;margin:0 0 16px;">Time for a check-in</h1>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">Hi ${name || 'there'},</p>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">
    It&rsquo;s been ${daysSinceLastEvent} days since your last life event update.
    Has anything changed? Job, family, or living situation changes can affect your coverage needs.
  </p>
  <a href="${APP_URL}/chat" style="display:inline-block;padding:12px 24px;background:#1C1210;color:#FAF0E4;border-radius:12px;font-size:14px;text-decoration:none;margin-top:8px;">
    Update your profile
  </a>
  <p style="font-size:11px;color:#B8A690;margin-top:24px;line-height:1.5;">
    You&rsquo;re receiving this because you have a CareBridge AI account.
  </p>
</div>`
}

function enrollmentCountdownHtml(name: string, daysRemaining: number): string {
  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2C1810;">
  <p style="font-size:14px;color:#8B7355;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;">CareBridge AI</p>
  <h1 style="font-size:24px;font-style:italic;margin:0 0 16px;">Open enrollment closing soon</h1>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">Hi ${name || 'there'},</p>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">
    Open enrollment ends in <strong>${daysRemaining} days</strong>.
    Don&rsquo;t miss your window to review and update your health coverage.
  </p>
  <p style="font-size:15px;line-height:1.7;color:#5C4033;">
    Use CareBridge to compare plans personalized to your health profile and find the best fit.
  </p>
  <a href="${APP_URL}/chat" style="display:inline-block;padding:12px 24px;background:#1C1210;color:#FAF0E4;border-radius:12px;font-size:14px;text-decoration:none;margin-top:8px;">
    Compare plans now
  </a>
  <p style="font-size:11px;color:#B8A690;margin-top:24px;line-height:1.5;">
    This is not medical advice. Verify enrollment deadlines with your state marketplace.
  </p>
</div>`
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  emailHtml?: string,
): Promise<{ notificationId: string; emailSent: boolean }> {
  // Look up user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })

  // Create notification record
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      emailSent: false,
      read: false,
    },
  })

  // Send email if user has an email address and Resend is configured
  let emailSent = false
  if (user?.email && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: user.email,
        subject: title,
        html: emailHtml ?? `<p>${body}</p>`,
      })
      emailSent = true

      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailSent: true },
      })
    } catch (err) {
      console.error(`Failed to send email to ${user.email}:`, err)
    }
  }

  return { notificationId: notification.id, emailSent }
}

// ---------------------------------------------------------------------------
// Notification generators (used by cron)
// ---------------------------------------------------------------------------

const GAP_THRESHOLD = 50 // Score below this triggers a gap alert

export async function checkCoverageGaps(): Promise<number> {
  // Find users with recent coverage scores below threshold
  // who haven't been alerted in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      coverageScores: {
        some: {
          overallScore: { lt: GAP_THRESHOLD },
        },
      },
      // Exclude users already notified recently
      NOT: {
        notifications: {
          some: {
            type: 'coverage_gap_alert',
            createdAt: { gte: sevenDaysAgo },
          },
        },
      },
    },
    include: {
      coverageScores: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  let sent = 0
  for (const user of users) {
    const score = user.coverageScores[0]
    if (!score) continue

    const gaps: string[] = []
    if (score.hospital < GAP_THRESHOLD) gaps.push('Hospital coverage')
    if (score.prescriptionDrugs < GAP_THRESHOLD) gaps.push('Prescription drug coverage')
    if (score.dental < GAP_THRESHOLD) gaps.push('Dental coverage')
    if (score.vision < GAP_THRESHOLD) gaps.push('Vision coverage')
    if (score.mentalHealth < GAP_THRESHOLD) gaps.push('Mental health coverage')
    if (score.emergency < GAP_THRESHOLD) gaps.push('Emergency coverage')

    if (gaps.length === 0) continue

    const title = `Coverage gap alert: ${gaps.length} area${gaps.length > 1 ? 's' : ''} need attention`
    const body = `Your coverage score is ${score.overallScore}/100. Gaps found in: ${gaps.join(', ')}.`

    await sendNotification(
      user.id,
      'coverage_gap_alert',
      title,
      body,
      coverageGapAlertHtml(user.name ?? '', gaps, score.overallScore),
    )
    sent++
  }

  return sent
}

export async function checkLifeEventCheckins(): Promise<number> {
  // Find users whose most recent life event is ~90 days old
  // and who haven't received a check-in notification in the last 30 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      lifeEvents: {
        some: {
          createdAt: {
            gte: hundredDaysAgo,
            lte: ninetyDaysAgo,
          },
        },
      },
      NOT: {
        notifications: {
          some: {
            type: 'life_event_checkin',
            createdAt: { gte: thirtyDaysAgo },
          },
        },
      },
    },
    include: {
      lifeEvents: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  let sent = 0
  for (const user of users) {
    const lastEvent = user.lifeEvents[0]
    if (!lastEvent) continue

    const daysSince = Math.round(
      (Date.now() - lastEvent.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    )

    const title = 'Time for a coverage check-in'
    const body = `It's been ${daysSince} days since your last life event. Has anything changed?`

    await sendNotification(
      user.id,
      'life_event_checkin',
      title,
      body,
      lifeEventCheckinHtml(user.name ?? '', daysSince),
    )
    sent++
  }

  return sent
}

export async function checkEnrollmentCountdown(): Promise<number> {
  // Open enrollment typically runs Nov 1 – Jan 15
  // Alert users 30, 14, and 7 days before the deadline
  const now = new Date()
  const currentYear = now.getFullYear()

  // Determine next enrollment deadline
  let deadline: Date
  const jan15 = new Date(currentYear, 0, 15) // Jan 15
  const nov1 = new Date(currentYear, 10, 1) // Nov 1

  if (now < jan15) {
    deadline = jan15
  } else {
    // Next enrollment period starts Nov 1, deadline Jan 15 next year
    deadline = new Date(currentYear + 1, 0, 15)
  }

  const daysRemaining = Math.round(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )

  // Only send at 30, 14, or 7 days out
  if (daysRemaining !== 30 && daysRemaining !== 14 && daysRemaining !== 7) {
    return 0
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      NOT: {
        notifications: {
          some: {
            type: 'enrollment_countdown',
            createdAt: { gte: sevenDaysAgo },
          },
        },
      },
    },
  })

  let sent = 0
  for (const user of users) {
    const title = `Open enrollment ends in ${daysRemaining} days`
    const body = `Don't miss your window to review and update your health coverage.`

    await sendNotification(
      user.id,
      'enrollment_countdown',
      title,
      body,
      enrollmentCountdownHtml(user.name ?? '', daysRemaining),
    )
    sent++
  }

  return sent
}
