import { describe, it, expect, vi } from 'vitest'

// Mock server-only and dependencies
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/llm-client', () => ({
  generateStructuredObject: vi.fn(),
}))

import { MEMORY_THRESHOLD } from './memory'

describe('memory', () => {
  it('exports a threshold of 10 messages', () => {
    expect(MEMORY_THRESHOLD).toBe(10)
  })

  it('exports generateConversationMemory function', async () => {
    const mod = await import('./memory')
    expect(typeof mod.generateConversationMemory).toBe('function')
  })

  it('exports maybeGenerateMemory function', async () => {
    const mod = await import('./memory')
    expect(typeof mod.maybeGenerateMemory).toBe('function')
  })
})
