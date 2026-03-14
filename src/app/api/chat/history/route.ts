import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const historySchema = z.object({
  guestSessionId: z.string().optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  const body = await request.json().catch(() => ({}))
  const parsed = historySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid history payload.' }, { status: 400 })
  }

  const whereClauses = [
    session?.user?.id ? { userId: session.user.id } : null,
    parsed.data.guestSessionId ? { guestSessionId: parsed.data.guestSessionId } : null,
  ].filter(Boolean) as Array<{ userId?: string; guestSessionId?: string }>

  if (!whereClauses.length) {
    return NextResponse.json({ ok: true, conversations: [] })
  }

  const conversations = await prisma.chatConversation.findMany({
    where: {
      OR: whereClauses,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 12,
    include: {
      messages: {
        orderBy: {
          sequence: 'asc',
        },
        take: 12,
      },
      retrievalHits: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      },
    },
  })

  return NextResponse.json({
    ok: true,
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      latestQuestion: conversation.latestQuestion,
      latestAnswer: conversation.latestAnswer,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sequence: message.sequence,
      })),
      retrievalHits: conversation.retrievalHits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        relativePath: hit.relativePath,
        score: hit.score,
      })),
    })),
  })
}
