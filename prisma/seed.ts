import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, PlanType, MetalTier } from '../src/generated/prisma/index.js'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/caregiver_ai?schema=public'

const adapter = new PrismaPg({ connectionString: databaseUrl })
const prisma = new PrismaClient({ adapter })

const carriers = [
  'SummitHealth',
  'BrightPath Insurance',
  'CoastGuard Health',
  'Redwood Mutual',
  'CivicCare Plans',
  'HarborLine Health',
  'Blue Mesa Benefits',
  'Everstead Health',
]

const metalConfig = {
  [MetalTier.bronze]: {
    premium: [280, 420],
    deductible: [5500, 8700],
    maxOutOfPocket: [8000, 9100],
    coinsurance: [30, 40],
    primaryCareCopay: [40, 50],
    specialistCopay: [80, 100],
  },
  [MetalTier.silver]: {
    premium: [380, 560],
    deductible: [2500, 5000],
    maxOutOfPocket: [7000, 8500],
    coinsurance: [20, 30],
    primaryCareCopay: [25, 40],
    specialistCopay: [50, 80],
  },
  [MetalTier.gold]: {
    premium: [460, 650],
    deductible: [800, 2000],
    maxOutOfPocket: [5000, 7000],
    coinsurance: [15, 20],
    primaryCareCopay: [15, 30],
    specialistCopay: [35, 60],
  },
  [MetalTier.platinum]: {
    premium: [580, 800],
    deductible: [0, 500],
    maxOutOfPocket: [2000, 4000],
    coinsurance: [5, 10],
    primaryCareCopay: [5, 20],
    specialistCopay: [20, 40],
  },
} as const

const stateConfig = [
  { code: 'CA', name: 'California', premiumOffset: 45, providerSuffix: 'Pacific', carriers: [0, 1, 2, 3] },
  { code: 'TX', name: 'Texas', premiumOffset: -10, providerSuffix: 'Lone Star', carriers: [1, 4, 5, 6] },
  { code: 'NY', name: 'New York', premiumOffset: 55, providerSuffix: 'Hudson', carriers: [0, 2, 5, 7] },
  { code: 'FL', name: 'Florida', premiumOffset: 5, providerSuffix: 'Gulf', carriers: [2, 3, 4, 7] },
  { code: 'IL', name: 'Illinois', premiumOffset: 20, providerSuffix: 'Prairie', carriers: [0, 4, 6, 7] },
] as const

const drugCatalog = [
  'Metformin',
  'Lisinopril',
  'Atorvastatin',
  'Albuterol',
  'Sertraline',
  'Losartan',
  'Levothyroxine',
  'Amlodipine',
  'Omeprazole',
  'Hydrochlorothiazide',
  'Gabapentin',
  'Escitalopram',
  'Montelukast',
  'Fluticasone',
  'Rosuvastatin',
  'Pantoprazole',
  'Bupropion',
  'Trazodone',
  'Citalopram',
  'Duloxetine',
  'Venlafaxine',
  'Furosemide',
  'Meloxicam',
  'Celecoxib',
  'Prednisone',
  'Amoxicillin',
  'Azithromycin',
  'Cephalexin',
  'Clindamycin',
  'Doxycycline',
  'Insulin glargine',
  'Insulin lispro',
  'Glipizide',
  'Sitagliptin',
  'Empagliflozin',
  'Semaglutide',
  'Metoprolol',
  'Carvedilol',
  'Clopidogrel',
  'Aspirin',
  'Warfarin',
  'Apixaban',
  'Rivaroxaban',
  'Cyclobenzaprine',
  'Baclofen',
  'Tamsulosin',
  'Finasteride',
  'Oxybutynin',
  'Mirabegron',
  'Lamotrigine',
  'Quetiapine',
  'Aripiprazole',
  'Buspirone',
  'Hydroxyzine',
  'Zolpidem',
  'Methylphenidate',
  'Atomoxetine',
  'Topiramate',
  'Sumatriptan',
  'Rizatriptan',
  'Ondansetron',
  'Meclizine',
  'Loratadine',
  'Cetirizine',
  'Fexofenadine',
  'Benzonatate',
  'Tiotropium',
  'Budesonide',
  'Symbicort',
  'Advair Diskus',
  'Mometasone',
  'Triamcinolone',
  'Tacrolimus',
  'Ketoconazole',
  'Metronidazole',
  'Nitrofurantoin',
  'Valacyclovir',
  'Acyclovir',
  'Allopurinol',
  'Colchicine',
  'Alendronate',
  'Vitamin D3',
  'Folic acid',
  'Ferrous sulfate',
  'Potassium chloride',
  'Magnesium oxide',
  'Sildenafil',
  'Famotidine',
  'Dicyclomine',
  'Sucralfate',
  'Lactulose',
  'Polyethylene glycol',
  'Senna',
  'Docusate sodium',
  'Spironolactone',
  'Valsartan',
  'Olmesartan',
  'Nifedipine',
  'Verapamil',
  'Isosorbide mononitrate',
  'Nitroglycerin',
  'Methocarbamol',
  'Diclofenac',
  'Ibuprofen',
  'Naproxen',
  'Acetaminophen',
  'Tramadol',
  'Codeine-guaifenesin',
  'Promethazine',
  'Propranolol',
  'Pramipexole',
  'Ropinirole',
  'Donepezil',
  'Memantine',
  'Ergocalciferol',
  'Desvenlafaxine',
  'Vortioxetine',
]

const firstNames = [
  'Avery',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Cameron',
  'Parker',
  'Reese',
  'Hayden',
  'Quinn',
  'Drew',
  'Logan',
  'Emerson',
  'Bailey',
  'Sydney',
  'Devon',
  'Rowan',
  'Skyler',
  'Peyton',
]

const lastNames = [
  'Caldwell',
  'Monroe',
  'Bennett',
  'Navarro',
  'Patel',
  'Kim',
  'Sullivan',
  'Brooks',
  'Morrison',
  'Alvarez',
  'Reed',
  'Shah',
  'Nguyen',
  'Chambers',
  'Foster',
  'Ramirez',
  'Hughes',
  'Bishop',
  'Lopez',
  'Warren',
]

const planSeries = {
  [MetalTier.bronze]: ['Trail', 'Guide', 'Harbor'],
  [MetalTier.silver]: ['Balance', 'Harbor', 'Bridge'],
  [MetalTier.gold]: ['Select', 'Signature', 'Pinnacle'],
  [MetalTier.platinum]: ['Premier', 'Reserve', 'Elite'],
} as const

type Range = readonly [number, number]

function hash(input: string): number {
  return Array.from(input).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 17), 0)
}

function rangeValue(seed: string, range: Range, step = 10): number {
  const [min, max] = range
  const span = Math.floor((max - min) / step)
  return min + (hash(seed) % (span + 1)) * step
}

function clamp(value: number, range: Range): number {
  return Math.max(range[0], Math.min(range[1], value))
}

function sampleWindow<T>(items: readonly T[], seed: string, min: number, max: number): T[] {
  const safeMax = Math.min(max, items.length)
  const safeMin = Math.min(min, safeMax)
  const count = safeMin + (hash(seed) % (safeMax - safeMin + 1))
  const start = hash(`${seed}-start`) % items.length
  const results: T[] = []

  for (let index = 0; results.length < count; index += 1) {
    const item = items[(start + index) % items.length]
    if (!results.includes(item)) {
      results.push(item)
    }
  }

  return results
}

function buildProviderNetwork(stateLabel: string, stateSeed: string): string[] {
  const count = 20 + (hash(stateSeed) % 21)
  const doctors: string[] = []

  for (let index = 0; doctors.length < count; index += 1) {
    const first = firstNames[(hash(`${stateSeed}-first-${index}`) + index) % firstNames.length]
    const last = lastNames[(hash(`${stateSeed}-last-${index}`) + index) % lastNames.length]
    const doctor = `Dr. ${first} ${last} ${stateLabel} Medical Group`
    if (!doctors.includes(doctor)) {
      doctors.push(doctor)
    }
  }

  return doctors
}

function buildPlanName(carrier: string, metalTier: MetalTier, suffix: string, iteration: number): string {
  const series = planSeries[metalTier][iteration % planSeries[metalTier].length]
  const metalLabel = metalTier.charAt(0).toUpperCase() + metalTier.slice(1)
  return `${carrier} ${series} ${suffix} ${metalLabel}`
}

async function main() {
  const plans = stateConfig.flatMap((state, stateIndex) => {
    const providerNetwork = buildProviderNetwork(state.providerSuffix, `${state.code}-providers`)

    return [
      { tier: MetalTier.bronze, count: 2 },
      { tier: MetalTier.silver, count: 3 },
      { tier: MetalTier.gold, count: 2 },
      { tier: MetalTier.platinum, count: 1 },
    ].flatMap(({ tier, count }, tierIndex) => {
      return Array.from({ length: count }, (_, iteration) => {
        const seed = `${state.code}-${tier}-${iteration}`
        const carrierIndex = state.carriers[(tierIndex + iteration + stateIndex) % state.carriers.length]
        const carrier = carriers[carrierIndex]
        const config = metalConfig[tier]
        const adjustedPremium = clamp(
          rangeValue(`${seed}-premium`, config.premium) + state.premiumOffset,
          config.premium,
        )

        return {
          planCode: `${state.code}-${tier.toUpperCase()}-${String(iteration + 1).padStart(2, '0')}`,
          name: buildPlanName(carrier, tier, state.providerSuffix, iteration),
          carrier,
          state: state.name,
          metalTier: tier,
          planType: [PlanType.HMO, PlanType.PPO, PlanType.EPO][(hash(`${seed}-type`) + iteration) % 3],
          monthlyPremium: adjustedPremium,
          deductible: rangeValue(`${seed}-deductible`, config.deductible, 50),
          maxOutOfPocket: rangeValue(`${seed}-moop`, config.maxOutOfPocket, 50),
          coinsuranceRate: rangeValue(`${seed}-coinsurance`, config.coinsurance, 1),
          primaryCareCopay: rangeValue(`${seed}-pcp`, config.primaryCareCopay, 5),
          specialistCopay: rangeValue(`${seed}-specialist`, config.specialistCopay, 5),
          formulary: sampleWindow(drugCatalog, `${seed}-formulary`, 50, 100),
          providerNetwork: sampleWindow(providerNetwork, `${seed}-network`, 20, providerNetwork.length),
        }
      })
    })
  })

  await prisma.plan.deleteMany()
  await prisma.plan.createMany({ data: plans })

  console.log(`Seeded ${plans.length} mock insurance plans.`)
}

main()
  .catch((error) => {
    console.error('Failed to seed mock plans.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
