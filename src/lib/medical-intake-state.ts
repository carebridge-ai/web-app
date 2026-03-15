import type { MedicalProfileData } from './medical-extraction'

// ─── Stage definitions ──────────────────────────────────────────────────────

export const STAGES = [1, 2, 3, 4, 5, 6, 7] as const
export type StageNumber = (typeof STAGES)[number]

export const STAGE_LABELS: Record<StageNumber, string> = {
  1: 'Current conditions',
  2: 'Medications',
  3: 'Allergies',
  4: 'Surgical history',
  5: 'Family history',
  6: 'Lifestyle & risk factors',
  7: 'Review & confirm',
}

/** Which MedicalProfileData keys each stage is responsible for filling. */
const STAGE_FIELDS: Record<StageNumber, (keyof MedicalProfileData)[]> = {
  1: ['conditions'],
  2: ['medications'],
  3: ['allergies'],
  4: ['surgeries'],
  5: ['familyHistory'],
  6: ['riskFactors'],
  7: [], // review stage — no new fields
}

// ─── State type ─────────────────────────────────────────────────────────────

export interface MedicalIntakeState {
  currentStage: StageNumber
  extracted: Partial<MedicalProfileData>
  skippedStages: StageNumber[]
  confidence: Partial<Record<keyof MedicalProfileData, number>>
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createInitialState(): MedicalIntakeState {
  return {
    currentStage: 1,
    extracted: {},
    skippedStages: [],
    confidence: {},
    conversationHistory: [],
  }
}

// ─── advanceStage ───────────────────────────────────────────────────────────

/**
 * Merges `extraction` into the state and advances to the next stage if the
 * current stage's required fields are now populated (non-empty arrays).
 *
 * If `extraction` is null the stage is marked as skipped and we still advance.
 *
 * Returns a new state object (immutable).
 */
export function advanceStage(
  state: MedicalIntakeState,
  extraction: Partial<MedicalProfileData> | null,
): MedicalIntakeState {
  const next = { ...state }

  if (next.currentStage === 7) {
    // Already at review — nothing to advance
    return next
  }

  if (extraction === null) {
    // User chose to skip this stage
    next.skippedStages = [...next.skippedStages, next.currentStage]
    next.currentStage = Math.min(next.currentStage + 1, 7) as StageNumber
    return next
  }

  // Merge extraction into the accumulated profile
  const merged = { ...next.extracted }
  const updatedConfidence = { ...next.confidence }

  for (const key of Object.keys(extraction) as (keyof MedicalProfileData)[]) {
    if (key === 'overallConfidence') continue

    const incoming = extraction[key]
    if (!Array.isArray(incoming)) continue

    const existing = (merged[key] as unknown[] | undefined) ?? []
    ;(merged as Record<string, unknown>)[key] = [...existing, ...incoming]

    // Track per-field confidence from the items
    if (incoming.length > 0) {
      const avgConfidence =
        incoming.reduce((sum, item) => {
          const c = (item as Record<string, unknown>).confidence
          return sum + (typeof c === 'number' ? c : 0)
        }, 0) / incoming.length
      updatedConfidence[key] = avgConfidence
    }
  }

  next.extracted = merged
  next.confidence = updatedConfidence

  // Check if current stage fields are filled
  const requiredFields = STAGE_FIELDS[next.currentStage]
  const filled = requiredFields.every((field) => {
    const arr = merged[field]
    return Array.isArray(arr) && arr.length > 0
  })

  if (filled || requiredFields.length === 0) {
    next.currentStage = Math.min(next.currentStage + 1, 7) as StageNumber
  }

  return next
}

// ─── getStagePrompt ─────────────────────────────────────────────────────────

const SHARED_RULES = `RULES:
- Only extract information explicitly stated by the user.
- NEVER invent or assume data the user did not mention.
- Set null for any field the user did not provide.
- Set a confidence score (0–1) for each item based on how clearly it was stated.
- Return empty arrays if the user says "none" or "nothing" for a category.
- Normalize medical terminology when possible.
- Dates should be ISO format (YYYY-MM-DD) when available, null otherwise.
- Return valid JSON matching the schema below.`

export function getStagePrompt(stage: StageNumber): string {
  switch (stage) {
    case 1:
      return `You are a friendly medical intake assistant collecting a patient's current health conditions.

Ask about any diagnosed conditions (e.g. diabetes, hypertension, asthma, depression).
Clarify whether each is active, historical, resolved, or suspected.
Ask for approximate diagnosis dates if known.

${SHARED_RULES}

SCHEMA — extract into:
conditions: Array of { name: string, status: "active"|"historical"|"resolved"|"suspected", diagnosedDate: string|null, notes: string|null, confidence: number }`

    case 2:
      return `You are a friendly medical intake assistant collecting the patient's current medications.

Ask about prescription medications, over-the-counter medications, and supplements.
For each, ask about dosage, frequency, and what condition it treats.

${SHARED_RULES}

SCHEMA — extract into:
medications: Array of { name: string, dosage: string|null, frequency: string|null, prescribedFor: string|null, confidence: number }`

    case 3:
      return `You are a friendly medical intake assistant collecting the patient's known allergies.

Ask about drug allergies, food allergies, and environmental allergies.
For each, ask about the reaction and severity.

${SHARED_RULES}

SCHEMA — extract into:
allergies: Array of { substance: string, reaction: string|null, severity: "mild"|"moderate"|"severe"|"unknown", confidence: number }`

    case 4:
      return `You are a friendly medical intake assistant collecting the patient's surgical history.

Ask about any past surgeries or major medical procedures.
For each, ask for the approximate date and any relevant notes.

${SHARED_RULES}

SCHEMA — extract into:
surgeries: Array of { procedure: string, date: string|null, notes: string|null, confidence: number }`

    case 5:
      return `You are a friendly medical intake assistant collecting the patient's family medical history.

Ask about conditions that run in the family — parents, siblings, grandparents.
Common relevant conditions: heart disease, cancer, diabetes, hypertension, mental health conditions.

${SHARED_RULES}

SCHEMA — extract into:
familyHistory: Array of { relation: string, condition: string, notes: string|null, confidence: number }`

    case 6:
      return `You are a friendly medical intake assistant collecting lifestyle and risk factors.

Ask about smoking status, alcohol use, exercise habits, diet, occupational hazards, and any other relevant risk factors.

${SHARED_RULES}

SCHEMA — extract into:
riskFactors: Array of { factor: string, status: "current"|"former"|"unknown", notes: string|null, confidence: number }`

    case 7:
      return `You are a friendly medical intake assistant. The patient has completed all intake stages.

Present a clear summary of everything collected so far and ask the patient to confirm the data is correct, or point out anything that needs to be changed.

Do NOT extract new data. Simply summarize what has been gathered.`

    default:
      return ''
  }
}
