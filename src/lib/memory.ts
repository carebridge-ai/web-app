import 'server-only'

import { z } from 'zod'
import { generateStructuredObject } from '@/lib/llm-client'
import { prisma } from '@/lib/prisma'

// ── Schema ────────────────────────────────────────────────────────

const memorySchema = z.object({
  summary: z.string(),
  keyDecisions: z.array(z.string()),
  followUps: z.array(z.string()),
  emotionalState: z.string().nullable(),
})

export type ConversationMemory = z.infer<typeof memorySchema>

// ── Threshold ─────────────────────────────────────────────────────

/** Minimum message count before memory generation is worthwhile. */
export const MEMORY_THRESHOLD = 10

// ── Generator ─────────────────────────────────────────────────────

/**
 * Load a conversation's messages, send to the LLM for summarisation,
 * and upsert a UserMemory record. Returns the generated memory or
 * null if the conversation is too short or has no userId.
 */
export async function generateConversationMemory(
  conversationId: string,
): Promise<ConversationMemory | null> {
  // Load conversation + messages
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { sequence: 'asc' },
      },
    },
  })

  if (!conversation) return null
  if (!conversation.userId) return null
  if (conversation.messages.length < MEMORY_THRESHOLD) return null

  // Format messages for the LLM
  const transcript = conversation.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const memory = await generateStructuredObject({
    schema: memorySchema,
    system: [
      'You are a conversation analyst for CareBridge, a healthcare coverage support system for people in Canada.',
      'You will receive a transcript of a conversation between a user and the CareBridge AI assistant.',
      'Your job is to produce a concise memory record so the assistant can recall this conversation in future sessions.',
      '',
      'Return a JSON object with exactly these fields:',
      '- "summary": A 2–3 sentence summary of what the user wanted and what was discussed. Focus on topics, not pleasantries.',
      '- "keyDecisions": An array of strings, each a concrete decision or conclusion the user reached (e.g. "Decided to enroll in OHIP+", "Prefers generic medications"). May be empty if no decisions were made.',
      '- "followUps": An array of strings, each a follow-up item the user mentioned or the assistant suggested (e.g. "Check eligibility for CDCP", "Bring prescription list to next appointment"). May be empty.',
      '- "emotionalState": A single word or short phrase describing the user\'s overall emotional tone (e.g. "anxious", "relieved", "frustrated", "calm", "confused"). Null if neutral or unclear.',
    ].join('\n'),
    prompt: transcript,
    maxTokens: 800,
  })

  // Upsert: one memory per conversation, update if re-generated
  await prisma.userMemory.upsert({
    where: {
      id: await getExistingMemoryId(conversation.userId, conversationId),
    },
    update: {
      summary: memory.summary,
      keyDecisions: memory.keyDecisions,
      followUps: memory.followUps,
      emotionalState: memory.emotionalState,
    },
    create: {
      userId: conversation.userId,
      conversationId,
      summary: memory.summary,
      keyDecisions: memory.keyDecisions,
      followUps: memory.followUps,
      emotionalState: memory.emotionalState,
    },
  })

  return memory
}

/**
 * Check whether a memory already exists for this user+conversation.
 * Returns the existing ID or a sentinel for the upsert.
 */
async function getExistingMemoryId(
  userId: string,
  conversationId: string,
): Promise<string> {
  const existing = await prisma.userMemory.findFirst({
    where: { userId, conversationId },
    select: { id: true },
  })
  return existing?.id ?? '__no_existing_memory__'
}

/**
 * Check if a conversation has crossed the memory threshold and
 * does not yet have a memory record. If so, generate one.
 * Designed to be called fire-and-forget after each chat turn.
 */
export async function maybeGenerateMemory(
  conversationId: string,
): Promise<void> {
  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: {
        userId: true,
        _count: { select: { messages: true } },
      },
    })

    if (!conversation?.userId) return
    if (conversation._count.messages < MEMORY_THRESHOLD) return

    // Only generate if no memory exists yet, or every 10 messages after the first
    const existingMemory = await prisma.userMemory.findFirst({
      where: {
        userId: conversation.userId,
        conversationId,
      },
      select: { id: true, createdAt: true },
    })

    const messageCount = conversation._count.messages

    // Generate on first threshold crossing, then refresh every 10 messages
    if (!existingMemory || messageCount % 10 === 0) {
      await generateConversationMemory(conversationId)
    }
  } catch {
    // Memory generation is best-effort — never block the chat
  }
}
