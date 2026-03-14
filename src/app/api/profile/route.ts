import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const profileSchema = z.object({
  province: z.string(),
  immigrationStatus: z.enum(['citizen', 'permanent_resident', 'work_permit', 'student_visa', 'refugee', 'asylum_seeker', 'undocumented', 'unknown']),
  residencyStartDate: z.string(),
  ageBand: z.enum(['0-17', '18-25', '26-35', '36-45', '46-55', '56-64', '65+']),
  employmentStatus: z.enum(['student', 'employed', 'self_employed', 'unemployed', 'retiree']),
  hasEmployerBenefits: z.enum(['yes', 'no', 'unknown']),
  dependants: z.object({
    spouse: z.boolean(),
    children: z.number().int().min(0),
  }),
  incomeBand: z.enum(['low', 'medium', 'high', 'prefer_not_to_say']),
  specialCategory: z.enum(['refugee', 'temp_foreign_worker', 'intl_student', 'asylum_seeker']).nullable(),
  language: z.string().default('en'),
})

const ageBandMap = {
  '0-17': 'AGE_0_17',
  '18-25': 'AGE_18_25',
  '26-35': 'AGE_26_35',
  '36-45': 'AGE_36_45',
  '46-55': 'AGE_46_55',
  '56-64': 'AGE_56_64',
  '65+': 'AGE_65_PLUS',
} as const

const reverseAgeBandMap: Record<string, string> = {
  AGE_0_17: '0-17',
  AGE_18_25: '18-25',
  AGE_26_35: '26-35',
  AGE_36_45: '36-45',
  AGE_46_55: '46-55',
  AGE_56_64: '56-64',
  AGE_65_PLUS: '65+',
}

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ profile: null }, { status: 200 })
  }

  try {
    const dbProfile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
    })

    if (!dbProfile) {
      return NextResponse.json({ profile: null }, { status: 200 })
    }

    const dependants = dbProfile.dependants as { spouse: boolean; children: number } | null

    return NextResponse.json({
      profile: {
        province: dbProfile.province,
        immigrationStatus: dbProfile.immigrationStatus,
        residencyStartDate: dbProfile.residencyStartDate,
        ageBand: reverseAgeBandMap[dbProfile.ageBand] ?? '18-25',
        employmentStatus: dbProfile.employmentStatus,
        hasEmployerBenefits: dbProfile.hasEmployerBenefits,
        dependants: dependants ?? { spouse: false, children: 0 },
        incomeBand: dbProfile.incomeBand,
        specialCategory: dbProfile.specialCategory,
        language: dbProfile.language,
      },
    })
  } catch {
    return NextResponse.json({ profile: null }, { status: 200 })
  }
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = profileSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid profile payload.' }, { status: 400 })
  }

  const profile = parsed.data

  await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      province: profile.province,
      immigrationStatus: profile.immigrationStatus,
      residencyStartDate: profile.residencyStartDate,
      ageBand: ageBandMap[profile.ageBand],
      employmentStatus: profile.employmentStatus,
      hasEmployerBenefits: profile.hasEmployerBenefits,
      dependants: profile.dependants,
      incomeBand: profile.incomeBand,
      specialCategory: profile.specialCategory,
      language: profile.language,
    },
    update: {
      province: profile.province,
      immigrationStatus: profile.immigrationStatus,
      residencyStartDate: profile.residencyStartDate,
      ageBand: ageBandMap[profile.ageBand],
      employmentStatus: profile.employmentStatus,
      hasEmployerBenefits: profile.hasEmployerBenefits,
      dependants: profile.dependants,
      incomeBand: profile.incomeBand,
      specialCategory: profile.specialCategory,
      language: profile.language,
    },
  })

  await prisma.consentLog.create({
    data: {
      userId: session.user.id,
      action: 'profile_saved',
    },
  })

  return NextResponse.json({ ok: true })
}
