'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/lib/profile-context'
import { PlanRecommendationPanel } from '@/components/chat/plan-recommendation-panel'
import { RecommendationInsightsPanel } from '@/components/chat/recommendation-insights-panel'
import { MedicalFileUpload } from '@/components/medical/file-upload'
import { MedicalIntakeChat } from '@/components/medical/intake-chat'
import Link from 'next/link'

type Tab = 'support' | 'plans' | 'insights' | 'medical' | 'sessions' | 'copilot' | 'sources'

const TABS: { id: Tab; label: string }[] = [
  { id: 'support', label: 'Support' },
  { id: 'plans', label: 'Plan search' },
  { id: 'insights', label: 'Insights' },
  { id: 'medical', label: 'Medical history' },
  { id: 'sessions', label: 'Saved sessions' },
  { id: 'copilot', label: 'Coverage copilot' },
  { id: 'sources', label: 'Sources' },
]

type Source = {
  title: string
  relativePath: string
  score: number
}

type HistoryMessage = {
  id: string
  role: string
  content: string
  sequence: number
}

type HistoryConversation = {
  id: string
  title: string
  latestQuestion: string | null
  latestAnswer: string | null
  updatedAt: string
  messages: HistoryMessage[]
  retrievalHits: Source[]
}

export function ChatTabsLayout({
  visitorLabel,
  isAuthenticated,
}: {
  visitorLabel: string
  isAuthenticated: boolean
}) {
  const [activeTab, setActiveTab] = useState<Tab>('copilot')

  // Chat state (lifted from ChatWorkspace)
  const { profile } = useProfile()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [history, setHistory] = useState<HistoryConversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [guestSessionId, setGuestSessionId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadHistory(nextGuestSessionId: string) {
    const response = await fetch('/api/chat/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestSessionId: nextGuestSessionId }),
    })

    const payload = (await response.json()) as {
      conversations?: HistoryConversation[]
    }

    if (response.ok) {
      setHistory(payload.conversations ?? [])
    }
  }

  useEffect(() => {
    const storedConversationId = window.localStorage.getItem('carebridge.chat.conversationId')
    const storedGuestSessionId = window.localStorage.getItem('carebridge.chat.guestSessionId')
    const nextGuestSessionId = storedGuestSessionId || crypto.randomUUID()

    if (storedConversationId) {
      setConversationId(storedConversationId)
    }

    setGuestSessionId(nextGuestSessionId)
    window.localStorage.setItem('carebridge.chat.guestSessionId', nextGuestSessionId)
    void loadHistory(nextGuestSessionId)
  }, [])

  async function handleAsk() {
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion) {
      setError('Add a question first.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          guestSessionId: guestSessionId || undefined,
          messages: [{ role: 'user', content: trimmedQuestion }],
          userProfile: profile ?? undefined,
        }),
      })

      const payload = (await response.json()) as {
        answer?: string
        conversationId?: string
        error?: string
        sources?: Source[]
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to get a response.')
      }

      setAnswer(payload.answer ?? '')
      setSources(payload.sources ?? [])

      if (payload.conversationId) {
        setConversationId(payload.conversationId)
        window.localStorage.setItem('carebridge.chat.conversationId', payload.conversationId)
      }

      if (guestSessionId) {
        void loadHistory(guestSessionId)
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 page-enter">
      {/* ── Tab navigation ──────────────────────────────────── */}
      <nav className="surface-panel rounded-card flex flex-wrap gap-1.5 p-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'rounded-button border border-sage bg-sage/10 px-4 py-2 font-serif text-[13px] font-medium text-espresso transition-all'
                : 'rounded-button border border-transparent px-4 py-2 font-serif text-[13px] text-driftwood transition-all hover:border-biscuit hover:text-espresso'
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Support / home ──────────────────────────────────── */}
      {activeTab === 'support' && (
        <div className="surface-panel rounded-card flex flex-col gap-5 p-6 sm:p-8 page-enter">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow text-driftwood">Chat workspace</p>
            <h1 className="font-cormorant text-[32px] italic leading-tight text-espresso">
              Your support space is ready.
            </h1>
            <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
              Signed in as <span className="font-medium text-espresso">{visitorLabel}</span>.
              This placeholder page confirms the new auth flow can route people into the protected app shell.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-biscuit bg-parchment p-4">
              <p className="font-serif text-[13px] font-medium text-espresso">Auth status</p>
              <p className="mt-2 font-serif text-[14px] leading-6 text-driftwood">
                {isAuthenticated
                  ? 'Authenticated with NextAuth session.'
                  : 'Guest access via local guest cookie.'}
              </p>
            </div>
            <div className="rounded-card border border-biscuit bg-parchment p-4">
              <p className="font-serif text-[13px] font-medium text-espresso">Profile flow</p>
              <p className="mt-2 font-serif text-[14px] leading-6 text-driftwood">
                Onboarding can now persist profile data through Prisma-backed API routes.
              </p>
            </div>
            <div className="rounded-card border border-biscuit bg-parchment p-4">
              <p className="font-serif text-[13px] font-medium text-espresso">Next build step</p>
              <p className="mt-2 font-serif text-[14px] leading-6 text-driftwood">
                Claude-backed retrieval now answers against the live coverage docs repository.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className="btn-primary flex items-center justify-center sm:max-w-[220px]"
            >
              Review onboarding
            </Link>
            <Link
              href="/"
              className="btn-secondary flex items-center justify-center sm:max-w-[220px]"
            >
              Back to home
            </Link>
          </div>
        </div>
      )}

      {/* ── Live plan search ────────────────────────────────── */}
      {activeTab === 'plans' && (
        <div className="page-enter">
          <PlanRecommendationPanel />
        </div>
      )}

      {/* ── ML Insights ─────────────────────────────────────── */}
      {activeTab === 'insights' && (
        <div className="page-enter">
          <RecommendationInsightsPanel />
        </div>
      )}

      {/* ── Medical history ────────────────────────────────────── */}
      {activeTab === 'medical' && (
        <div className="flex flex-col gap-6 page-enter">
          <MedicalIntakeChat onComplete={() => setActiveTab('copilot')} />

          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1 bg-biscuit/50" />
            <span className="font-serif text-[12px] uppercase tracking-[0.18em] text-sandstone">
              or upload a document
            </span>
            <div className="h-px flex-1 bg-biscuit/50" />
          </div>

          <MedicalFileUpload />
        </div>
      )}

      {/* ── Saved sessions / recent chats ───────────────────── */}
      {activeTab === 'sessions' && (
        <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow text-driftwood">Recent chats</p>
            <h2 className="font-cormorant text-[30px] italic leading-tight text-espresso">
              Saved sessions
            </h2>
            <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
              Conversations stored in Prisma for this signed-in or guest session.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {history.length ? (
              history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setConversationId(item.id)
                    setAnswer(item.latestAnswer ?? '')
                    setQuestion(item.latestQuestion ?? '')
                    setSources(item.retrievalHits)
                    window.localStorage.setItem('carebridge.chat.conversationId', item.id)
                    setActiveTab('copilot')
                  }}
                  className="rounded-card border border-biscuit bg-parchment p-4 text-left transition-colors hover:border-sage"
                >
                  <p className="font-serif text-[14px] font-medium text-espresso">{item.title}</p>
                  <p className="mt-2 line-clamp-3 font-serif text-[13px] leading-6 text-driftwood">
                    {item.latestQuestion ?? 'No question saved yet.'}
                  </p>
                  <p className="mt-2 font-serif text-[12px] uppercase tracking-[0.18em] text-sandstone">
                    {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-card border border-dashed border-biscuit bg-parchment p-4 font-serif text-[14px] leading-6 text-driftwood sm:col-span-2 lg:col-span-3">
                No saved chats yet. Ask your first question to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Coverage copilot ────────────────────────────────── */}
      {activeTab === 'copilot' && (
        <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow text-driftwood">Coverage copilot</p>
            <h2 className="font-cormorant text-[30px] italic leading-tight text-espresso">
              Ask policy questions against your real source documents.
            </h2>
            <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
              This chat now grounds answers in the `docs-source` coverage repository and can be
              paired with patient medical feature extraction on the server.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="font-serif text-[13px] font-medium text-espresso">Question</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="input-field min-h-[180px] resize-y"
              placeholder="Ask about coverage, eligibility, exclusions, coordination of benefits, or reimbursement rules."
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleAsk}
              className="btn-primary sm:max-w-[220px]"
              disabled={isLoading}
            >
              {isLoading ? 'Thinking...' : 'Ask CareBridge'}
            </button>
            {error ? <p className="font-serif text-[14px] text-terracotta">{error}</p> : null}
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 px-1">
              <span className="font-cormorant italic text-[12px] text-driftwood">CareBridge AI</span>
              <div className="flex gap-1">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
              </div>
            </div>
          )}

          <div className="rounded-card border border-biscuit bg-parchment p-4">
            <p className="font-serif text-[13px] font-medium text-espresso">Answer</p>
            <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-[1.7] text-driftwood">
              {answer || 'Your answer will appear here with document-grounded guidance.'}
            </p>
            {answer && (
              <p className="mt-3 font-serif text-[11px] leading-[1.5] text-sandstone">
                CareBridge AI provides estimates only. Verify with your provincial health authority or insurer before
                enrolling.
              </p>
            )}
          </div>

          {/* Inline source count hint */}
          {sources.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className="self-start font-serif text-[13px] text-driftwood transition-colors hover:text-espresso"
            >
              {sources.length} source{sources.length !== 1 ? 's' : ''} retrieved &rarr;
            </button>
          )}
        </div>
      )}

      {/* ── Retrieved sources / grounding context ───────────── */}
      {activeTab === 'sources' && (
        <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow text-driftwood">Retrieved sources</p>
            <h2 className="font-cormorant text-[30px] italic leading-tight text-espresso">
              Grounding context
            </h2>
            <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
              Top matching documents used for the latest answer.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {sources.length ? (
              sources.map((source, idx) => (
                <div
                  key={`${source.relativePath}-${source.score}-${idx}`}
                  className="rounded-card border border-biscuit bg-parchment p-4"
                >
                  <p className="font-serif text-[14px] font-medium text-espresso">{source.title}</p>
                  <p className="mt-1 font-serif text-[13px] leading-6 text-driftwood">
                    {source.relativePath}
                  </p>
                  <p className="mt-2 font-serif text-[12px] uppercase tracking-[0.18em] text-sandstone">
                    Match score {source.score}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-dashed border-biscuit bg-parchment p-4 font-serif text-[14px] leading-6 text-driftwood sm:col-span-2">
                No sources yet. Ask a question to run retrieval.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
