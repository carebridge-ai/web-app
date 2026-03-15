import { describe, it, expect, vi } from 'vitest'

// Mock Prisma before importing portfolio module
vi.mock('@/lib/prisma', () => ({
  prisma: {},
}))

import { buildPortfolioPrompt, type UserPortfolio } from './portfolio'

function emptyPortfolio(): UserPortfolio {
  return { profile: null, medical: null, recentMemories: [] }
}

describe('buildPortfolioPrompt', () => {
  it('returns empty string when portfolio is empty', () => {
    expect(buildPortfolioPrompt(emptyPortfolio())).toBe('')
  })

  it('includes age and province', () => {
    const p = emptyPortfolio()
    p.profile = {
      province: 'ON',
      immigrationStatus: 'unknown',
      ageBand: 'AGE_36_45',
      employmentStatus: 'unemployed',
      hasEmployerBenefits: 'unknown',
      incomeBand: 'medium',
      specialCategory: null,
      language: 'en',
      dependants: [],
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('36–45')
    expect(result).toContain('Ontario')
  })

  it('includes immigration status and employment', () => {
    const p = emptyPortfolio()
    p.profile = {
      province: 'BC',
      immigrationStatus: 'permanent_resident',
      ageBand: 'AGE_26_35',
      employmentStatus: 'self_employed',
      hasEmployerBenefits: 'no',
      incomeBand: 'high',
      specialCategory: null,
      language: 'en',
      dependants: [],
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('permanent resident')
    expect(result).toContain('self-employed')
    expect(result).toContain('without employer benefits')
  })

  it('includes dependants count', () => {
    const p = emptyPortfolio()
    p.profile = {
      province: 'ON',
      immigrationStatus: 'unknown',
      ageBand: 'AGE_36_45',
      employmentStatus: 'unemployed',
      hasEmployerBenefits: 'unknown',
      incomeBand: 'medium',
      specialCategory: null,
      language: 'en',
      dependants: [{ relation: 'child', ageBand: '0-5' }, { relation: 'child', ageBand: '6-12' }],
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('2 dependants')
  })

  it('includes medical conditions and medications', () => {
    const p = emptyPortfolio()
    p.medical = {
      conditions: [{ name: 'Type 2 diabetes' }, { name: 'hypertension' }],
      medications: [{ name: 'metformin' }, { name: 'lisinopril' }],
      allergies: [{ name: 'penicillin' }],
      surgeries: [],
      familyHistory: [],
      riskFactors: [{ name: 'smoker' }],
      confidence: 0.85,
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('Type 2 diabetes')
    expect(result).toContain('metformin')
    expect(result).toContain('penicillin')
    expect(result).toContain('smoker')
  })

  it('includes recent memories', () => {
    const p = emptyPortfolio()
    p.recentMemories = [
      {
        summary: 'Asked about dental coverage options.',
        keyDecisions: [],
        followUps: [],
        emotionalState: null,
        createdAt: new Date(),
      },
    ]
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('dental coverage')
  })

  it('builds full prompt with all sections', () => {
    const p: UserPortfolio = {
      profile: {
        province: 'ON',
        immigrationStatus: 'citizen',
        ageBand: 'AGE_36_45',
        employmentStatus: 'employed',
        hasEmployerBenefits: 'yes',
        incomeBand: 'medium',
        specialCategory: null,
        language: 'en',
        dependants: [{ relation: 'spouse' }],
      },
      medical: {
        conditions: [{ name: 'Type 2 diabetes' }],
        medications: [{ name: 'metformin' }],
        allergies: [],
        surgeries: [],
        familyHistory: [],
        riskFactors: [],
        confidence: 0.9,
      },
      recentMemories: [
        {
          summary: 'Last time they asked about dental coverage.',
          keyDecisions: [],
          followUps: [],
          emotionalState: null,
          createdAt: new Date(),
        },
      ],
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('36–45')
    expect(result).toContain('Ontario')
    expect(result).toContain('citizen')
    expect(result).toContain('with employer benefits')
    expect(result).toContain('1 dependant')
    expect(result).toContain('Type 2 diabetes')
    expect(result).toContain('metformin')
    expect(result).toContain('dental coverage')
  })

  it('handles string-only arrays in medical data', () => {
    const p = emptyPortfolio()
    p.medical = {
      conditions: ['asthma', 'eczema'],
      medications: ['ventolin'],
      allergies: [],
      surgeries: [],
      familyHistory: [],
      riskFactors: [],
      confidence: 0.7,
    }
    const result = buildPortfolioPrompt(p)
    expect(result).toContain('asthma')
    expect(result).toContain('ventolin')
  })
})
