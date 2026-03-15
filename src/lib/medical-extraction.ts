import 'server-only'

import { readFile } from 'fs/promises'
import { z } from 'zod'
import { generateStructuredObject } from '@/lib/llm-client'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/heic'])

// ---------------------------------------------------------------------------
// Text extraction (PDF / image OCR)
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a medical document.
 * Supports PDF (via pdf-parse) and images (via Tesseract.js OCR).
 */
export async function extractTextFromDocument(
  filePath: string,
  mimeType: string,
): Promise<string> {
  if (mimeType === 'application/pdf') {
    return extractFromPdf(filePath)
  }

  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return extractFromImage(filePath)
  }

  throw new Error(`Unsupported mime type for text extraction: ${mimeType}`)
}

async function extractFromPdf(filePath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const buffer = await readFile(filePath)
  const data = new Uint8Array(buffer)
  const parser = new PDFParse(data)
  const result = await parser.getText()
  return result.text.trim()
}

async function extractFromImage(filePath: string): Promise<string> {
  const Tesseract = await import('tesseract.js')
  const result = await Tesseract.recognize(filePath, 'eng')
  return result.data.text.trim()
}

// ---------------------------------------------------------------------------
// LLM-powered structured medical data extraction
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  name: z.string().describe('Normalized medical condition name'),
  status: z.enum(['active', 'historical', 'resolved', 'suspected']),
  diagnosedDate: z.string().nullable().describe('Date diagnosed if found, otherwise null'),
  notes: z.string().nullable().describe('Relevant notes from the source text, otherwise null'),
  confidence: z.number().min(0).max(1).describe('0–1 confidence that this condition is accurately extracted'),
})

const medicationSchema = z.object({
  name: z.string().describe('Normalized medication name'),
  dosage: z.string().nullable().describe('Dosage if stated, otherwise null'),
  frequency: z.string().nullable().describe('Frequency if stated, otherwise null'),
  prescribedFor: z.string().nullable().describe('Condition this treats if stated, otherwise null'),
  confidence: z.number().min(0).max(1),
})

const allergySchema = z.object({
  substance: z.string().describe('Normalized allergen name'),
  reaction: z.string().nullable().describe('Reaction type if stated, otherwise null'),
  severity: z.enum(['mild', 'moderate', 'severe', 'unknown']),
  confidence: z.number().min(0).max(1),
})

const surgerySchema = z.object({
  procedure: z.string().describe('Normalized procedure name'),
  date: z.string().nullable().describe('Date of surgery if found, otherwise null'),
  notes: z.string().nullable().describe('Relevant notes, otherwise null'),
  confidence: z.number().min(0).max(1),
})

const familyHistorySchema = z.object({
  relation: z.string().describe('Family member relation (e.g. "mother", "father", "sibling")'),
  condition: z.string().describe('Condition name'),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const immunizationSchema = z.object({
  vaccine: z.string().describe('Vaccine name'),
  date: z.string().nullable().describe('Date administered if found, otherwise null'),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const labResultSchema = z.object({
  testName: z.string().describe('Lab test name'),
  value: z.string().nullable().describe('Result value if found, otherwise null'),
  unit: z.string().nullable().describe('Unit of measurement if found, otherwise null'),
  referenceRange: z.string().nullable().describe('Normal range if stated, otherwise null'),
  interpretation: z.enum(['normal', 'abnormal', 'critical', 'unknown']),
  date: z.string().nullable().describe('Test date if found, otherwise null'),
  confidence: z.number().min(0).max(1),
})

const riskFactorSchema = z.object({
  factor: z.string().describe('Risk factor name (e.g. "smoking", "obesity", "sedentary lifestyle")'),
  status: z.enum(['current', 'former', 'unknown']),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const medicalProfileDataSchema = z.object({
  conditions: z.array(conditionSchema),
  medications: z.array(medicationSchema),
  allergies: z.array(allergySchema),
  surgeries: z.array(surgerySchema),
  familyHistory: z.array(familyHistorySchema),
  immunizations: z.array(immunizationSchema),
  labResults: z.array(labResultSchema),
  riskFactors: z.array(riskFactorSchema),
  overallConfidence: z.number().min(0).max(1).describe(
    'Overall confidence in the extraction quality (0–1). Lower if the text was sparse, illegible, or ambiguous.',
  ),
})

export type MedicalProfileData = z.infer<typeof medicalProfileDataSchema>

const MEDICAL_EXTRACTION_SYSTEM_PROMPT = `You are a medical data extraction engine. You read raw clinical text (from medical documents, prescriptions, lab reports, discharge summaries, or physician notes) and extract structured patient data.

RULES:
1. Only extract information that is explicitly stated or strongly implied by the text.
2. NEVER invent, hallucinate, or assume data that is not in the source text.
3. If a field cannot be determined from the text, set it to null.
4. Set a confidence score (0–1) for each extracted item:
   - 1.0 = explicitly and clearly stated
   - 0.7–0.9 = clearly stated but minor ambiguity (e.g. abbreviation)
   - 0.4–0.6 = implied or partially stated
   - 0.1–0.3 = weak evidence, best guess
5. Return empty arrays for categories with no evidence — never fabricate entries.
6. Normalize medical terminology (e.g. "heart attack" → "myocardial infarction", "high blood pressure" → "hypertension").
7. Dates should be in ISO format (YYYY-MM-DD) when available, null when not.

SCHEMA — return a JSON object with these fields:

conditions: Array of diagnosed conditions.
  Each: { name: string, status: "active"|"historical"|"resolved"|"suspected", diagnosedDate: string|null, notes: string|null, confidence: number }

medications: Array of current or recent medications.
  Each: { name: string, dosage: string|null, frequency: string|null, prescribedFor: string|null, confidence: number }

allergies: Array of known allergies.
  Each: { substance: string, reaction: string|null, severity: "mild"|"moderate"|"severe"|"unknown", confidence: number }

surgeries: Array of past surgeries or procedures.
  Each: { procedure: string, date: string|null, notes: string|null, confidence: number }

familyHistory: Array of family medical history items.
  Each: { relation: string, condition: string, notes: string|null, confidence: number }

immunizations: Array of immunization records.
  Each: { vaccine: string, date: string|null, notes: string|null, confidence: number }

labResults: Array of lab or diagnostic test results.
  Each: { testName: string, value: string|null, unit: string|null, referenceRange: string|null, interpretation: "normal"|"abnormal"|"critical"|"unknown", date: string|null, confidence: number }

riskFactors: Array of lifestyle or genetic risk factors.
  Each: { factor: string, status: "current"|"former"|"unknown", notes: string|null, confidence: number }

overallConfidence: number (0–1) — your overall confidence in the extraction quality given the source text.`

/**
 * Sends raw medical text to the LLM and returns structured data
 * matching the MedicalProfile Prisma schema fields.
 */
export async function extractMedicalData(rawText: string): Promise<MedicalProfileData> {
  if (!rawText.trim()) {
    return {
      conditions: [],
      medications: [],
      allergies: [],
      surgeries: [],
      familyHistory: [],
      immunizations: [],
      labResults: [],
      riskFactors: [],
      overallConfidence: 0,
    }
  }

  return generateStructuredObject({
    schema: medicalProfileDataSchema,
    system: MEDICAL_EXTRACTION_SYSTEM_PROMPT,
    prompt: [
      'Extract all medical data from the following clinical text.',
      'Return empty arrays for categories with no evidence. Set null for unknown fields.',
      '',
      '--- BEGIN MEDICAL TEXT ---',
      rawText,
      '--- END MEDICAL TEXT ---',
    ].join('\n'),
    maxTokens: 4000,
  })
}
