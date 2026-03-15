'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExtractedItem = Record<string, unknown>

interface ChatResponse {
  ok: boolean
  conversationId: string
  reply: string
  stage: number
  stageLabel: string
  previousStage: number
  stageAdvanced: boolean
  extracted: Record<string, ExtractedItem[]>
  skippedStages: number[]
  confidence: Record<string, number>
  isComplete: boolean
  error?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Current conditions',
  2: 'Medications',
  3: 'Allergies',
  4: 'Surgical history',
  5: 'Family history',
  6: 'Lifestyle & risk factors',
  7: 'Review & confirm',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MedicalIntakeChat({ onComplete }: { onComplete?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [guestSessionId, setGuestSessionId] = useState('')
  const [stage, setStage] = useState(1)
  const [extracted, setExtracted] = useState<Record<string, ExtractedItem[]>>({})
  const [confidence, setConfidence] = useState<Record<string, number>>({})
  const [skippedStages, setSkippedStages] = useState<number[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [editingExtracted, setEditingExtracted] = useState<Record<string, ExtractedItem[]> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const stored = window.localStorage.getItem('carebridge.chat.guestSessionId')
    const nextId = stored || crypto.randomUUID()
    setGuestSessionId(nextId)
    if (!stored) window.localStorage.setItem('carebridge.chat.guestSessionId', nextId)
  }, [])

  // Greet user on mount
  useEffect(() => {
    if (guestSessionId && messages.length === 0) {
      sendMessage(
        "Hi, I'd like to share my medical history.",
        true,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestSessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // ─── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, isGreeting = false) => {
      const trimmed = text.trim()
      if (!trimmed) return

      setError('')
      setIsLoading(true)

      // Add user message to UI (skip for auto-greeting)
      if (!isGreeting) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', content: trimmed },
        ])
      }

      try {
        const res = await fetch('/api/medical/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationId: conversationId || undefined,
            guestSessionId: guestSessionId || undefined,
          }),
        })

        const data = (await res.json()) as ChatResponse

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to get a response.')
        }

        // Add assistant reply
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: data.reply },
        ])

        setStage(data.stage)
        setExtracted(data.extracted)
        setConfidence(data.confidence)
        setSkippedStages(data.skippedStages)
        setIsComplete(data.isComplete)

        if (data.conversationId) {
          setConversationId(data.conversationId)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setIsLoading(false)
        setInput('')
        inputRef.current?.focus()
      }
    },
    [conversationId, guestSessionId],
  )

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoading && input.trim()) {
      void sendMessage(input)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) {
        void sendMessage(input)
      }
    }
  }

  function handleSkip() {
    if (!isLoading) {
      void sendMessage("I'd like to skip this section.")
    }
  }

  function handleConfirm() {
    setConfirmed(true)
    onComplete?.()
  }

  function handleEdit() {
    setEditingExtracted({ ...extracted })
  }

  function removeItem(category: string, index: number) {
    setEditingExtracted((prev) => {
      if (!prev) return prev
      const arr = prev[category]
      if (!Array.isArray(arr)) return prev
      return { ...prev, [category]: arr.filter((_, i) => i !== index) }
    })
  }

  function handleSaveEdits() {
    if (editingExtracted) {
      setExtracted(editingExtracted)
      setEditingExtracted(null)
    }
  }

  function handleCancelEdits() {
    setEditingExtracted(null)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const displayExtracted = editingExtracted ?? extracted
  const filledCategories = Object.entries(displayExtracted).filter(
    ([, items]) => Array.isArray(items) && items.length > 0,
  )

  return (
    <div className="surface-panel rounded-card flex flex-col gap-0 p-0 page-enter">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-6 pb-4 sm:px-8">
        <p className="section-eyebrow text-driftwood">Medical intake</p>
        <h2 className="font-cormorant text-[28px] italic leading-tight text-espresso">
          Share your medical history
        </h2>
        <p className="font-serif text-[14px] leading-[1.7] text-driftwood">
          Answer a few questions so we can match you with the right coverage.
          You can skip any section you are not sure about.
        </p>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────── */}
      <div className="px-6 sm:px-8">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((s) => (
            <div key={s} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-2 w-full rounded-full transition-colors ${
                  s < stage
                    ? skippedStages.includes(s)
                      ? 'bg-sandstone/40'
                      : 'bg-sage'
                    : s === stage
                      ? 'bg-sage/50'
                      : 'bg-biscuit/40'
                }`}
              />
              <span
                className={`hidden font-serif text-[10px] sm:block ${
                  s === stage ? 'font-medium text-espresso' : 'text-sandstone'
                }`}
              >
                {STAGE_LABELS[s]}
              </span>
            </div>
          ))}
        </div>

        {/* Mobile: show current stage label */}
        <p className="mt-1 font-serif text-[12px] text-driftwood sm:hidden">
          Stage {stage} of 7: {STAGE_LABELS[stage]}
        </p>
      </div>

      {/* ── Message thread ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4 sm:px-8" style={{ maxHeight: '420px', minHeight: '200px' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-card px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-sage/10 border border-sage/30'
                  : 'bg-parchment border border-biscuit'
              }`}
            >
              {msg.role === 'assistant' && (
                <p className="mb-1 font-cormorant text-[11px] italic text-driftwood">
                  CareBridge
                </p>
              )}
              <p className="whitespace-pre-wrap font-serif text-[14px] leading-[1.7] text-espresso">
                {msg.content}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-card border border-biscuit bg-parchment px-4 py-3">
              <span className="font-cormorant text-[11px] italic text-driftwood">CareBridge</span>
              <div className="flex gap-1">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-6 rounded-card border border-terracotta/30 bg-terracotta/5 px-4 py-2 sm:mx-8">
          <p className="font-serif text-[13px] text-terracotta">{error}</p>
        </div>
      )}

      {/* ── Stage 7: Review summary ─────────────────────────────────── */}
      {isComplete && !confirmed && (
        <div className="flex flex-col gap-4 px-6 py-4 sm:px-8">
          <div className="rounded-card border border-sage/30 bg-sage/5 px-4 py-3">
            <p className="font-serif text-[14px] font-medium text-espresso">
              Your medical profile is ready for review.
            </p>
            <p className="mt-1 font-serif text-[13px] text-driftwood">
              Check the summary below, then confirm to save.
            </p>
          </div>

          {/* Extracted data summary */}
          <SummarySection
            title="Conditions"
            items={(displayExtracted.conditions as ExtractedItem[]) ?? []}
            labelKey="name"
            detailKeys={['status', 'diagnosedDate', 'notes']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('conditions', i)}
          />
          <SummarySection
            title="Medications"
            items={(displayExtracted.medications as ExtractedItem[]) ?? []}
            labelKey="name"
            detailKeys={['dosage', 'frequency', 'prescribedFor']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('medications', i)}
          />
          <SummarySection
            title="Allergies"
            items={(displayExtracted.allergies as ExtractedItem[]) ?? []}
            labelKey="substance"
            detailKeys={['reaction', 'severity']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('allergies', i)}
          />
          <SummarySection
            title="Surgeries"
            items={(displayExtracted.surgeries as ExtractedItem[]) ?? []}
            labelKey="procedure"
            detailKeys={['date', 'notes']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('surgeries', i)}
          />
          <SummarySection
            title="Family history"
            items={(displayExtracted.familyHistory as ExtractedItem[]) ?? []}
            labelKey="condition"
            detailKeys={['relation', 'notes']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('familyHistory', i)}
          />
          <SummarySection
            title="Risk factors"
            items={(displayExtracted.riskFactors as ExtractedItem[]) ?? []}
            labelKey="factor"
            detailKeys={['status', 'notes']}
            editable={editingExtracted !== null}
            onRemove={(i) => removeItem('riskFactors', i)}
          />

          {filledCategories.length === 0 && (
            <div className="rounded-card border border-dashed border-biscuit bg-parchment p-4">
              <p className="font-serif text-[14px] text-driftwood">
                No medical data was collected. You skipped all sections.
              </p>
            </div>
          )}

          {/* Confidence summary */}
          {Object.keys(confidence).length > 0 && (
            <div className="rounded-card border border-biscuit bg-parchment px-4 py-3">
              <p className="font-serif text-[13px] font-medium text-espresso">Confidence</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {Object.entries(confidence).map(([key, value]) => (
                  <span key={key} className="font-serif text-[12px] text-driftwood">
                    {key}: <span className="font-medium text-espresso">{Math.round(value * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {editingExtracted !== null ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  className="btn-primary sm:max-w-[220px]"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdits}
                  className="btn-secondary sm:max-w-[220px]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="btn-primary sm:max-w-[220px]"
                >
                  Confirm and save
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="btn-secondary sm:max-w-[220px]"
                >
                  Edit before saving
                </button>
              </>
            )}
          </div>

          <p className="font-serif text-[11px] leading-[1.5] text-sandstone">
            Your data is stored securely and used only for insurance plan matching.
          </p>
        </div>
      )}

      {/* ── Confirmed state ─────────────────────────────────────────── */}
      {confirmed && (
        <div className="flex flex-col gap-3 px-6 py-4 sm:px-8">
          <div className="rounded-card border border-sage/30 bg-sage/5 px-4 py-3">
            <p className="font-serif text-[14px] text-espresso">
              Medical profile saved successfully. Your insurance recommendations will now account
              for this data.
            </p>
          </div>
          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="btn-primary self-start"
            >
              Continue to coverage copilot
            </button>
          )}
        </div>
      )}

      {/* ── Input area (hide when complete & not editing) ────────────── */}
      {!isComplete && !confirmed && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 border-t border-biscuit/50 px-6 py-4 sm:px-8"
        >
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              rows={2}
              disabled={isLoading}
              className="input-field flex-1 resize-none"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="btn-primary sm:max-w-[160px]"
              >
                {isLoading ? 'Thinking...' : 'Send'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoading}
                className="btn-secondary sm:max-w-[160px]"
              >
                Skip this section
              </button>
            </div>
            <p className="font-serif text-[11px] text-sandstone">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Summary section sub-component ──────────────────────────────────────────

function SummarySection({
  title,
  items,
  labelKey,
  detailKeys,
  editable,
  onRemove,
}: {
  title: string
  items: ExtractedItem[]
  labelKey: string
  detailKeys: string[]
  editable: boolean
  onRemove: (index: number) => void
}) {
  if (!items.length) return null

  return (
    <div className="rounded-card border border-biscuit bg-parchment p-4">
      <p className="font-serif text-[13px] font-medium text-espresso">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item, idx) => (
          <div
            key={`${String(item[labelKey])}-${idx}`}
            className="flex items-start justify-between gap-2 border-t border-biscuit/50 pt-2 first:border-0 first:pt-0"
          >
            <div className="flex-1">
              <p className="font-serif text-[14px] text-espresso">
                {String(item[labelKey] ?? '')}
                {typeof item.confidence === 'number' && (
                  <span className="ml-2 font-serif text-[11px] text-sandstone">
                    {Math.round(item.confidence * 100)}%
                  </span>
                )}
              </p>
              <p className="font-serif text-[12px] leading-5 text-driftwood">
                {detailKeys
                  .map((key) => {
                    const val = item[key]
                    return val != null ? `${key}: ${String(val)}` : null
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="shrink-0 rounded-button border border-transparent px-2 py-1 font-serif text-[12px] text-terracotta transition-colors hover:border-terracotta/20 hover:bg-terracotta/5"
                title="Remove this item"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
