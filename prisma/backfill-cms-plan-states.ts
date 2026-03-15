import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/index.js'
import { zipToCounty } from '../src/data/zip-to-county'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/caregiver_ai?schema=public'

const adapter = new PrismaPg({ connectionString: databaseUrl })
const prisma = new PrismaClient({ adapter })

const stateFipsToAbbrev: Record<string, string> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
  '60': 'AS',
  '66': 'GU',
  '69': 'MP',
  '72': 'PR',
  '78': 'VI',
}

const validStates = new Set(Object.values(stateFipsToAbbrev))

function normalizeZip(zip: string) {
  const digits = zip.replace(/\D/g, '')
  return digits.length >= 5 ? digits.slice(0, 5) : null
}

function lookupStateByZip(zip: string) {
  const normalizedZip = normalizeZip(zip)
  if (!normalizedZip) return null
  const countyFips = zipToCounty[normalizedZip]
  if (!countyFips) return null
  const stateFips = countyFips.slice(0, 2)
  return stateFipsToAbbrev[stateFips] ?? null
}

function extractZip(eligibility: unknown): string | null {
  if (!eligibility || typeof eligibility !== 'object') {
    return null
  }

  const record = eligibility as Record<string, unknown>
  const zip = record.zip ?? record.zipCode ?? record.zipcode
  if (typeof zip === 'string') return zip
  if (typeof zip === 'number') return String(zip)
  return null
}

async function main() {
  const candidates = await prisma.plan.findMany({
    where: {
      source: 'cms',
    },
    select: {
      id: true,
      planCode: true,
      state: true,
      eligibility: true,
    },
  })

  let updated = 0
  let skippedNoZip = 0
  let skippedNoState = 0

  for (const plan of candidates) {
    const normalizedState = plan.state?.trim().toUpperCase()
    if (normalizedState && validStates.has(normalizedState)) {
      continue
    }

    const zip = extractZip(plan.eligibility)
    if (!zip) {
      skippedNoZip += 1
      continue
    }

    const state = lookupStateByZip(zip)
    if (!state) {
      skippedNoState += 1
      continue
    }

    await prisma.plan.update({
      where: { id: plan.id },
      data: { state },
    })
    updated += 1
  }

  console.log(
    `Backfill complete. Updated ${updated} plan(s). Skipped ${skippedNoZip} without ZIP. Skipped ${skippedNoState} without state.`
  )
}

main()
  .catch((error) => {
    console.error('Failed to backfill CMS plan states.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
