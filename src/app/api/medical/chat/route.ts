import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { generateStructuredObject } from '@/lib/llm-client'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'
import {
  createInitialState,
  advanceStage,
  getStagePrompt,
  STAGE_LABELS,
  type MedicalIntakeState,
  type StageNumber,
} from '@/lib/medical-intake-state'
import type { MedicalProfileData } from '@/lib/medical-extraction'

export const runtime = 'nodejs'

// ─── Request schema ──────────────────────────────────────────────────────────

const requestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  guestSessionId: z.string().optional(),
})

// ─── LLM response schema (reply + extraction) ───────────────────────────────

const intakeResponseSchema = z.object({
  reply: z.string().describe('Warm, conversational response to the patient'),
  extraction: z
    .object({
      conditions: z
        .array(
          z.object({
            name: z.string(),
            status: z.enum(['active', 'historical', 'resolved', 'suspected']),
            diagnosedDate: z.string().nullable(),
            notes: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
      medications: z
        .array(
          z.object({
            name: z.string(),
            dosage: z.string().nullable(),
            frequency: z.string().nullable(),
            prescribedFor: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
      allergies: z
        .array(
          z.object({
            substance: z.string(),
            reaction: z.string().nullable(),
            severity: z.enum(['mild', 'moderate', 'severe', 'unknown']),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
      surgeries: z
        .array(
          z.object({
            procedure: z.string(),
            date: z.string().nullable(),
            notes: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
      familyHistory: z
        .array(
          z.object({
            relation: z.string(),
            condition: z.string(),
            notes: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
      riskFactors: z
        .array(
          z.object({
            factor: z.string(),
            status: z.enum(['current', 'former', 'unknown']),
            notes: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
    })
    .nullable()
    .describe('Structured extraction from the user message, or null if nothing to extract'),
})

// ─── Warm system wrapper ─────────────────────────────────────────────────────

function buildSystemPrompt(stage: StageNumber, state: MedicalIntakeState): string {
  const stagePrompt = getStagePrompt(stage)

  const progressSummary = Object.entries(STAGE_LABELS)
    .map(([num, label]) => {
      const n = Number(num) as StageNumber
      if (n === stage) return `→ Stage ${n}: ${label} (CURRENT)`
      if (n < stage) return `✓ Stage ${n}: ${label}`
      return `  Stage ${n}: ${label}`
    })
    .join('\n')

  const collectedSummary =
    Object.keys(state.extracted).length > 0
      ? `\nData collected so far:\n${JSON.stringify(state.extracted, null, 2)}`
      : ''

  return `You are a warm, calming medical intake assistant for CareBridge, a Canadian healthcare coverage support platform.

TONE:
- Be gentle and reassuring. Many users are newcomers, elderly, or anxious about medical topics.
- Use simple, everyday language. Avoid clinical jargon unless the patient uses it first.
- Briefly explain why each question matters (e.g., "Knowing your medications helps us find plans that cover them.").
- If the user seems uncertain, offer examples to help them remember.
- If the user says "none", "nothing", or "skip", acknowledge that warmly and move on.

PROGRESS:
${progressSummary}
${collectedSummary}

STAGE INSTRUCTIONS:
${stagePrompt}

RESPONSE FORMAT:
You MUST return a JSON object with exactly two fields:
1. "reply" — your warm, conversational message to the patient (plain text, no markdown).
2. "extraction" — structured data extracted from the user's CURRENT message only.
   - If the user provided relevant medical info, extract it into the schema fields.
   - If the user said "none", "nothing", or wants to skip, set extraction to null.
   - If the user's message has no extractable medical data (e.g. greetings, questions), set extraction to null.
   - NEVER fabricate data. Only extract what the user explicitly stated.

Return valid JSON only. No commentary outside the JSON.`
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is required.' }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request. Send { message, conversationId?, guestSessionId? }.' }, { status: 400 })
  }

  const { message, conversationId, guestSessionId } = parsed.data
  const session = await auth()

  // ── Load or create intake state ──────────────────────────────────────────

  let state: MedicalIntakeState = createInitialState()
  let existingConversation: { id: string; metadata: unknown } | null = null
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = []

  if (conversationId) {
    existingConversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, metadata: true },
    })

    if (existingConversation?.metadata) {
      const meta = existingConversation.metadata as Record<string, unknown>
      if (meta.intakeState) {
        state = meta.intakeState as MedicalIntakeState
      }
    }

    // Load conversation history from DB
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
      select: { role: true, content: true },
    })

    history = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
  }

  // ── Build LLM messages ───────────────────────────────────────────────────

  const systemPrompt = buildSystemPrompt(state.currentStage, state)

  // Include conversation history + current message
  const llmMessages = [
    ...history.slice(-20), // Keep last 20 messages to stay within context
    { role: 'user' as const, content: message },
  ]

  // ── Call LLM ─────────────────────────────────────────────────────────────

  let reply: string
  let extraction: Partial<MedicalProfileData> | null

  try {
    const result = await generateStructuredObject({
      schema: intakeResponseSchema,
      system: systemPrompt,
      prompt: llmMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
      maxTokens: 2000,
    })

    reply = result.reply
    extraction = result.extraction ?? null
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'LLM request failed.'
    console.error('[medical/chat] LLM error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 502 })
  }

  // ── Advance state machine ───────────────────────────────────────────────

  const previousStage = state.currentStage
  state = advanceStage(state, extraction)

  // Update conversation history in state
  state.conversationHistory = [
    ...state.conversationHistory,
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ]

  // ── Persist to database ─────────────────────────────────────────────────

  let savedConversationId = conversationId ?? null

  try {
    const intakeMetadata = {
      type: 'medical-intake',
      intakeState: state,
    }

    if (existingConversation) {
      // Update existing conversation
      await prisma.chatConversation.update({
        where: { id: existingConversation.id },
        data: {
          latestQuestion: message,
          latestAnswer: reply,
          metadata: intakeMetadata as unknown as Prisma.InputJsonValue,
          medicalExtraction: extraction as unknown as Prisma.InputJsonValue,
        },
      })

      savedConversationId = existingConversation.id

      // Add messages
      const existingCount = await prisma.chatMessage.count({
        where: { conversationId: existingConversation.id },
      })

      await prisma.chatMessage.createMany({
        data: [
          {
            conversationId: existingConversation.id,
            role: 'user',
            content: message,
            sequence: existingCount + 1,
          },
          {
            conversationId: existingConversation.id,
            role: 'assistant',
            content: reply,
            sequence: existingCount + 2,
          },
        ],
      })
    } else {
      // Create new conversation
      const conversation = await prisma.chatConversation.create({
        data: {
          userId: session?.user?.id ?? null,
          guestSessionId: guestSessionId ?? null,
          title: 'Medical history intake',
          latestQuestion: message,
          latestAnswer: reply,
          metadata: intakeMetadata as unknown as Prisma.InputJsonValue,
          medicalExtraction: extraction as unknown as Prisma.InputJsonValue,
        },
      })

      savedConversationId = conversation.id

      await prisma.chatMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: 'user',
            content: message,
            sequence: 1,
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: reply,
            sequence: 2,
          },
        ],
      })
    }

    // ── At stage 7 completion, upsert MedicalProfile ─────────────────────

    if (state.currentStage === 7 && previousStage !== 7) {
      const userId = session?.user?.id ?? guestSessionId
      if (userId && Object.keys(state.extracted).length > 0) {
        await upsertMedicalProfileFromIntake(userId, state)
      }
    }
  } catch (err) {
    console.error('[medical/chat] DB error:', err instanceof Error ? err.message : err)
    // Still return the reply even if persistence fails
  }

  return NextResponse.json({
    ok: true,
    conversationId: savedConversationId,
    reply,
    stage: state.currentStage,
    stageLabel: STAGE_LABELS[state.currentStage],
    previousStage,
    stageAdvanced: state.currentStage !== previousStage,
    extracted: state.extracted,
    skippedStages: state.skippedStages,
    confidence: state.confidence,
    isComplete: state.currentStage === 7,
  })
}

// ─── Upsert MedicalProfile from completed intake ─────────────────────────────

async function upsertMedicalProfileFromIntake(
  userId: string,
  state: MedicalIntakeState,
) {
  const { extracted, confidence } = state

  // Compute overall confidence as average of per-field confidences
  const confidenceValues = Object.values(confidence).filter((v): v is number => typeof v === 'number')
  const overallConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0

  const existing = await prisma.medicalProfile.findUnique({
    where: { userId },
  })

  const profileData = {
    conditions: (extracted.conditions ?? []) as unknown as Prisma.InputJsonValue,
    medications: (extracted.medications ?? []) as unknown as Prisma.InputJsonValue,
    allergies: (extracted.allergies ?? []) as unknown as Prisma.InputJsonValue,
    surgeries: (extracted.surgeries ?? []) as unknown as Prisma.InputJsonValue,
    familyHistory: (extracted.familyHistory ?? []) as unknown as Prisma.InputJsonValue,
    immunizations: [] as unknown as Prisma.InputJsonValue,
    labResults: [] as unknown as Prisma.InputJsonValue,
    riskFactors: (extracted.riskFactors ?? []) as unknown as Prisma.InputJsonValue,
    confidence: overallConfidence,
  }

  if (existing) {
    await prisma.medicalProfile.update({
      where: { userId },
      data: {
        ...profileData,
        rawDocumentIds: existing.rawDocumentIds,
        lastUpdated: new Date(),
      },
    })
  } else {
    await prisma.medicalProfile.create({
      data: {
        userId,
        ...profileData,
        rawDocumentIds: [],
      },
    })
  }
}
