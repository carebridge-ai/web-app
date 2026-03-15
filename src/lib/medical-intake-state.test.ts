import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  advanceStage,
  getStagePrompt,
  STAGE_LABELS,
  STAGES,
  type MedicalIntakeState,
} from './medical-intake-state'

// ─── createInitialState ─────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('starts at stage 1 with empty data', () => {
    const state = createInitialState()
    expect(state.currentStage).toBe(1)
    expect(state.extracted).toEqual({})
    expect(state.skippedStages).toEqual([])
    expect(state.confidence).toEqual({})
    expect(state.conversationHistory).toEqual([])
  })
})

// ─── advanceStage ───────────────────────────────────────────────────────────

describe('advanceStage', () => {
  it('advances from stage 1 to 2 when conditions are provided', () => {
    const state = createInitialState()
    const result = advanceStage(state, {
      conditions: [
        { name: 'Hypertension', status: 'active', diagnosedDate: '2020-01-01', notes: null, confidence: 0.9 },
      ],
    })
    expect(result.currentStage).toBe(2)
    expect(result.extracted.conditions).toHaveLength(1)
    expect(result.extracted.conditions![0].name).toBe('Hypertension')
  })

  it('stays at same stage when extraction has no relevant fields', () => {
    const state = createInitialState() // stage 1 expects conditions
    const result = advanceStage(state, {
      medications: [
        { name: 'Lisinopril', dosage: '10mg', frequency: 'daily', prescribedFor: 'hypertension', confidence: 0.8 },
      ],
    })
    // conditions is still empty, so stage should not advance
    expect(result.currentStage).toBe(1)
    // But the medications data should be merged in
    expect(result.extracted.medications).toHaveLength(1)
  })

  it('advances when extraction is null (skip)', () => {
    const state = createInitialState()
    const result = advanceStage(state, null)
    expect(result.currentStage).toBe(2)
    expect(result.skippedStages).toEqual([1])
  })

  it('tracks multiple skipped stages', () => {
    let state = createInitialState()
    state = advanceStage(state, null) // skip 1
    state = advanceStage(state, null) // skip 2
    state = advanceStage(state, null) // skip 3
    expect(state.currentStage).toBe(4)
    expect(state.skippedStages).toEqual([1, 2, 3])
  })

  it('does not advance past stage 7', () => {
    const state: MedicalIntakeState = {
      currentStage: 7,
      extracted: {},
      skippedStages: [],
      confidence: {},
      conversationHistory: [],
    }
    const result = advanceStage(state, null)
    expect(result.currentStage).toBe(7)
  })

  it('merges multiple extractions for the same field', () => {
    let state = createInitialState()

    // First extraction with one condition — advances to stage 2
    state = advanceStage(state, {
      conditions: [
        { name: 'Diabetes', status: 'active', diagnosedDate: null, notes: null, confidence: 0.8 },
      ],
    })
    expect(state.currentStage).toBe(2)

    // Now at stage 2 — provide medications AND more conditions
    state = advanceStage(state, {
      conditions: [
        { name: 'Asthma', status: 'historical', diagnosedDate: null, notes: null, confidence: 0.7 },
      ],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'twice daily', prescribedFor: 'diabetes', confidence: 0.95 },
      ],
    })

    expect(state.currentStage).toBe(3)
    expect(state.extracted.conditions).toHaveLength(2)
    expect(state.extracted.medications).toHaveLength(1)
  })

  it('tracks per-field confidence as average of item confidences', () => {
    const state = createInitialState()
    const result = advanceStage(state, {
      conditions: [
        { name: 'A', status: 'active', diagnosedDate: null, notes: null, confidence: 0.8 },
        { name: 'B', status: 'active', diagnosedDate: null, notes: null, confidence: 0.6 },
      ],
    })
    expect(result.confidence.conditions).toBeCloseTo(0.7)
  })

  it('preserves immutability — does not mutate the input state', () => {
    const state = createInitialState()
    const result = advanceStage(state, {
      conditions: [
        { name: 'X', status: 'active', diagnosedDate: null, notes: null, confidence: 1 },
      ],
    })
    expect(state.currentStage).toBe(1)
    expect(state.extracted).toEqual({})
    expect(result.currentStage).toBe(2)
  })

  it('walks through all 7 stages with valid data', () => {
    let state = createInitialState()

    // Stage 1: conditions
    state = advanceStage(state, {
      conditions: [{ name: 'HTN', status: 'active', diagnosedDate: null, notes: null, confidence: 0.9 }],
    })
    expect(state.currentStage).toBe(2)

    // Stage 2: medications
    state = advanceStage(state, {
      medications: [{ name: 'Lisinopril', dosage: '10mg', frequency: 'daily', prescribedFor: 'HTN', confidence: 0.9 }],
    })
    expect(state.currentStage).toBe(3)

    // Stage 3: allergies
    state = advanceStage(state, {
      allergies: [{ substance: 'Penicillin', reaction: 'rash', severity: 'moderate', confidence: 0.85 }],
    })
    expect(state.currentStage).toBe(4)

    // Stage 4: surgeries
    state = advanceStage(state, {
      surgeries: [{ procedure: 'Appendectomy', date: '2015-03-10', notes: null, confidence: 0.95 }],
    })
    expect(state.currentStage).toBe(5)

    // Stage 5: family history
    state = advanceStage(state, {
      familyHistory: [{ relation: 'mother', condition: 'breast cancer', notes: null, confidence: 0.8 }],
    })
    expect(state.currentStage).toBe(6)

    // Stage 6: risk factors
    state = advanceStage(state, {
      riskFactors: [{ factor: 'smoking', status: 'former', notes: 'quit 2019', confidence: 0.9 }],
    })
    expect(state.currentStage).toBe(7)

    // Stage 7: review — does not advance
    state = advanceStage(state, null)
    expect(state.currentStage).toBe(7)
  })
})

// ─── getStagePrompt ─────────────────────────────────────────────────────────

describe('getStagePrompt', () => {
  it('returns a non-empty prompt for each stage 1–7', () => {
    for (const stage of STAGES) {
      const prompt = getStagePrompt(stage)
      expect(prompt.length).toBeGreaterThan(50)
    }
  })

  it('stage 1 prompt mentions conditions', () => {
    expect(getStagePrompt(1).toLowerCase()).toContain('condition')
  })

  it('stage 2 prompt mentions medications', () => {
    expect(getStagePrompt(2).toLowerCase()).toContain('medication')
  })

  it('stage 3 prompt mentions allergies', () => {
    expect(getStagePrompt(3).toLowerCase()).toContain('allerg')
  })

  it('stage 4 prompt mentions surgeries', () => {
    expect(getStagePrompt(4).toLowerCase()).toContain('surger')
  })

  it('stage 5 prompt mentions family', () => {
    expect(getStagePrompt(5).toLowerCase()).toContain('family')
  })

  it('stage 6 prompt mentions risk factors or lifestyle', () => {
    const prompt = getStagePrompt(6).toLowerCase()
    expect(prompt).toMatch(/risk|lifestyle/)
  })

  it('stage 7 prompt mentions review or confirm', () => {
    const prompt = getStagePrompt(7).toLowerCase()
    expect(prompt).toMatch(/review|confirm|summary/)
  })
})

// ─── STAGE_LABELS ───────────────────────────────────────────────────────────

describe('STAGE_LABELS', () => {
  it('has labels for all 7 stages', () => {
    for (const stage of STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy()
    }
  })
})
