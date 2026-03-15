import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { extractTextFromDocument, extractMedicalData } from '@/lib/medical-extraction'
import type { MedicalProfileData } from '@/lib/medical-extraction'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'

export const runtime = 'nodejs'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
])

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'medical')

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null)

    if (!formData) {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data.' },
        { status: 400 },
      )
    }

    const file = formData.get('file')
    const userId = formData.get('userId')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing "file" field in form data.' },
        { status: 400 },
      )
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Missing "userId" field in form data.' },
        { status: 400 },
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Allowed: PDF, PNG, JPG, HEIC.`,
        },
        { status: 400 },
      )
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
        },
        { status: 400 },
      )
    }

    // Generate a unique document ID and build the file path
    const documentId = randomUUID()
    const ext = extensionForMime(file.type)
    const fileName = `${documentId}${ext}`
    const filePath = path.join(UPLOAD_DIR, fileName)

    // Ensure the upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Write the file to disk
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Extract text from the document (PDF parse or OCR)
    const rawText = await extractTextFromDocument(filePath, file.type)

    // Send text to LLM for structured medical data extraction
    const extracted = await extractMedicalData(rawText)

    // Upsert to MedicalProfile — merge with existing data if user has uploaded before
    const profile = await upsertMedicalProfile(userId, documentId, extracted)

    return NextResponse.json({
      documentId,
      mimeType: file.type,
      extractedText: rawText.slice(0, 500) + (rawText.length > 500 ? '...' : ''),
      medicalProfile: profile,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    console.error('[medical/upload] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf'
    case 'image/png':
      return '.png'
    case 'image/jpeg':
      return '.jpg'
    case 'image/heic':
      return '.heic'
    default:
      return ''
  }
}

/** Merge two arrays of extracted items, deduplicating by a key field. */
function mergeArrays<T extends Record<string, unknown>>(
  existing: T[],
  incoming: T[],
  keyField: string,
): T[] {
  const map = new Map<string, T>()
  for (const item of existing) {
    const key = String(item[keyField] ?? '').toLowerCase()
    if (key) map.set(key, item)
  }
  for (const item of incoming) {
    const key = String(item[keyField] ?? '').toLowerCase()
    if (key) {
      const prev = map.get(key)
      // Keep the one with higher confidence
      if (!prev || ((item as Record<string, number>).confidence ?? 0) >= ((prev as Record<string, number>).confidence ?? 0)) {
        map.set(key, item)
      }
    }
  }
  return Array.from(map.values())
}

async function upsertMedicalProfile(
  userId: string,
  documentId: string,
  extracted: MedicalProfileData,
) {
  const existing = await prisma.medicalProfile.findUnique({
    where: { userId },
  })

  if (existing) {
    // Merge new extraction with existing data
    const merged = {
      conditions: mergeArrays(existing.conditions as Record<string, unknown>[], extracted.conditions, 'name'),
      medications: mergeArrays(existing.medications as Record<string, unknown>[], extracted.medications, 'name'),
      allergies: mergeArrays(existing.allergies as Record<string, unknown>[], extracted.allergies, 'substance'),
      surgeries: mergeArrays(existing.surgeries as Record<string, unknown>[], extracted.surgeries, 'procedure'),
      familyHistory: mergeArrays(existing.familyHistory as Record<string, unknown>[], extracted.familyHistory, 'condition'),
      immunizations: mergeArrays(existing.immunizations as Record<string, unknown>[], extracted.immunizations, 'vaccine'),
      labResults: mergeArrays(existing.labResults as Record<string, unknown>[], extracted.labResults, 'testName'),
      riskFactors: mergeArrays(existing.riskFactors as Record<string, unknown>[], extracted.riskFactors, 'factor'),
    }

    const rawDocumentIds = [...(existing.rawDocumentIds ?? []), documentId]
    const confidence = Math.max(existing.confidence, extracted.overallConfidence)

    return prisma.medicalProfile.update({
      where: { userId },
      data: {
        conditions: merged.conditions as unknown as Prisma.InputJsonValue,
        medications: merged.medications as unknown as Prisma.InputJsonValue,
        allergies: merged.allergies as unknown as Prisma.InputJsonValue,
        surgeries: merged.surgeries as unknown as Prisma.InputJsonValue,
        familyHistory: merged.familyHistory as unknown as Prisma.InputJsonValue,
        immunizations: merged.immunizations as unknown as Prisma.InputJsonValue,
        labResults: merged.labResults as unknown as Prisma.InputJsonValue,
        riskFactors: merged.riskFactors as unknown as Prisma.InputJsonValue,
        rawDocumentIds,
        confidence,
        lastUpdated: new Date(),
      },
    })
  }

  // Create new profile
  return prisma.medicalProfile.create({
    data: {
      userId,
      conditions: extracted.conditions,
      medications: extracted.medications,
      allergies: extracted.allergies,
      surgeries: extracted.surgeries,
      familyHistory: extracted.familyHistory,
      immunizations: extracted.immunizations,
      labResults: extracted.labResults,
      riskFactors: extracted.riskFactors,
      rawDocumentIds: [documentId],
      confidence: extracted.overallConfidence,
    },
  })
}
