import { prisma } from '@/lib/prisma'

// ── Types ─────────────────────────────────────────────────────────

export type UserPortfolio = {
  profile: {
    province: string
    immigrationStatus: string
    ageBand: string
    employmentStatus: string
    hasEmployerBenefits: string
    incomeBand: string
    specialCategory: string | null
    language: string
    dependants: unknown
  } | null
  medical: {
    conditions: unknown[]
    medications: unknown[]
    allergies: unknown[]
    surgeries: unknown[]
    familyHistory: unknown[]
    riskFactors: unknown[]
    confidence: number
  } | null
  recentMemories: {
    summary: string
    keyDecisions: unknown
    followUps: unknown
    emotionalState: string | null
    createdAt: Date
  }[]
}

// ── Loader ────────────────────────────────────────────────────────

export async function loadUserPortfolio(userId: string): Promise<UserPortfolio> {
  const [profile, medical, memories] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.medicalProfile.findUnique({ where: { userId } }),
    prisma.userMemory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  return {
    profile: profile
      ? {
          province: profile.province,
          immigrationStatus: profile.immigrationStatus,
          ageBand: profile.ageBand,
          employmentStatus: profile.employmentStatus,
          hasEmployerBenefits: profile.hasEmployerBenefits,
          incomeBand: profile.incomeBand,
          specialCategory: profile.specialCategory,
          language: profile.language,
          dependants: profile.dependants,
        }
      : null,
    medical: medical
      ? {
          conditions: medical.conditions as unknown[],
          medications: medical.medications as unknown[],
          allergies: medical.allergies as unknown[],
          surgeries: medical.surgeries as unknown[],
          familyHistory: medical.familyHistory as unknown[],
          riskFactors: medical.riskFactors as unknown[],
          confidence: medical.confidence,
        }
      : null,
    recentMemories: memories.map((m) => ({
      summary: m.summary,
      keyDecisions: m.keyDecisions,
      followUps: m.followUps,
      emotionalState: m.emotionalState,
      createdAt: m.createdAt,
    })),
  }
}

// ── Prompt builder ────────────────────────────────────────────────

const AGE_LABELS: Record<string, string> = {
  AGE_0_17: 'under 18',
  AGE_18_25: '18–25',
  AGE_26_35: '26–35',
  AGE_36_45: '36–45',
  AGE_46_55: '46–55',
  AGE_56_64: '56–64',
  AGE_65_PLUS: '65 or older',
}

const PROVINCE_LABELS: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
}

function formatProvince(code: string): string {
  return PROVINCE_LABELS[code] ?? code
}

function formatImmigration(status: string): string {
  return status.replace(/_/g, ' ')
}

function formatEmployment(status: string): string {
  return status.replace(/_/g, '-')
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'name' in item) return String(item.name)
      if (item && typeof item === 'object' && 'condition' in item) return String(item.condition)
      if (item && typeof item === 'object' && 'medication' in item) return String(item.medication)
      return null
    })
    .filter((s): s is string => s !== null)
}

export function buildPortfolioPrompt(portfolio: UserPortfolio): string {
  const parts: string[] = []

  // ── Demographics ──────────────────────────────────────────────
  if (portfolio.profile) {
    const p = portfolio.profile
    const age = AGE_LABELS[p.ageBand] ?? p.ageBand
    const province = formatProvince(p.province)

    let demo = `You are speaking with a ${age} year old`
    if (p.province !== 'unknown') demo += ` in ${province}`

    const statusParts: string[] = []
    if (p.immigrationStatus !== 'unknown') {
      statusParts.push(`${formatImmigration(p.immigrationStatus)}`)
    }
    if (p.employmentStatus !== 'unemployed') {
      statusParts.push(`currently ${formatEmployment(p.employmentStatus)}`)
    }
    if (p.hasEmployerBenefits === 'yes') {
      statusParts.push('with employer benefits')
    } else if (p.hasEmployerBenefits === 'no') {
      statusParts.push('without employer benefits')
    }

    if (statusParts.length > 0) {
      demo += ` who is a ${statusParts.join(', ')}`
    }

    // Dependants
    const deps = Array.isArray(p.dependants) ? p.dependants : []
    if (deps.length > 0) {
      demo += `. They have ${deps.length} dependant${deps.length !== 1 ? 's' : ''}`
    }

    parts.push(demo + '.')
  }

  // ── Medical ───────────────────────────────────────────────────
  if (portfolio.medical) {
    const m = portfolio.medical
    const medParts: string[] = []

    const conditions = asStringArray(m.conditions)
    if (conditions.length > 0) {
      medParts.push(`has ${conditions.join(', ')}`)
    }

    const medications = asStringArray(m.medications)
    if (medications.length > 0) {
      medParts.push(`takes ${medications.join(', ')}`)
    }

    const allergies = asStringArray(m.allergies)
    if (allergies.length > 0) {
      medParts.push(`is allergic to ${allergies.join(', ')}`)
    }

    const surgeries = asStringArray(m.surgeries)
    if (surgeries.length > 0) {
      medParts.push(`has had ${surgeries.join(', ')}`)
    }

    const riskFactors = asStringArray(m.riskFactors)
    if (riskFactors.length > 0) {
      medParts.push(`risk factors include ${riskFactors.join(', ')}`)
    }

    if (medParts.length > 0) {
      parts.push('Medically, this person ' + medParts.join('; ') + '.')
    }
  }

  // ── Recent conversation memory ────────────────────────────────
  if (portfolio.recentMemories.length > 0) {
    const memoryLines = portfolio.recentMemories.map((m) => m.summary)
    parts.push('Recent conversation context: ' + memoryLines.join(' '))
  }

  return parts.join(' ')
}
