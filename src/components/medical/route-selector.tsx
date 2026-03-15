'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MedicalFileUpload } from '@/components/medical/file-upload'
import { MedicalIntakeChat } from '@/components/medical/intake-chat'

type Mode = 'choose' | 'upload' | 'chat'

export function MedicalRouteSelector({ visitorLabel }: { visitorLabel: string }) {
  const [mode, setMode] = useState<Mode>('choose')
  const router = useRouter()

  function handleComplete() {
    router.push('/chat')
  }

  function handleSkip() {
    router.push('/chat')
  }

  // ── Upload path ──────────────────────────────────────────────────
  if (mode === 'upload') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 page-enter">
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="self-start font-serif text-[13px] text-driftwood transition-colors hover:text-espresso"
        >
          &larr; Back to options
        </button>

        <MedicalFileUpload />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleComplete}
            className="btn-secondary"
          >
            Continue to coverage workspace
          </button>
        </div>
      </div>
    )
  }

  // ── Chat path ────────────────────────────────────────────────────
  if (mode === 'chat') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 page-enter">
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="self-start font-serif text-[13px] text-driftwood transition-colors hover:text-espresso"
        >
          &larr; Back to options
        </button>

        <MedicalIntakeChat onComplete={handleComplete} />
      </div>
    )
  }

  // ── Choice screen ────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 page-enter">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="section-eyebrow text-driftwood">
          Signed in as <span className="font-medium text-espresso">{visitorLabel}</span>
        </p>
        <h1 className="font-cormorant text-[36px] italic leading-tight text-espresso sm:text-[42px]">
          Your medical history
        </h1>
        <p className="max-w-lg font-serif text-[15px] leading-[1.7] text-driftwood">
          Sharing your health background helps us recommend coverage that fits your
          actual needs. Choose the option that works best for you.
        </p>
      </div>

      {/* Two cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Upload card */}
        <button
          type="button"
          onClick={() => setMode('upload')}
          className="surface-panel group flex flex-col items-center gap-4 rounded-card p-8 text-center transition-all hover:border-sage hover:shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage/10 transition-colors group-hover:bg-sage/20">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-sage"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h2 className="font-cormorant text-[24px] italic leading-tight text-espresso">
            Upload documents
          </h2>
          <p className="font-serif text-[14px] leading-[1.7] text-driftwood">
            Have a medical record, prescription, lab report, or discharge summary?
            Upload it and we will extract the key details automatically.
          </p>
          <span className="mt-auto font-serif text-[13px] font-medium text-sage transition-colors group-hover:text-espresso">
            Upload a file &rarr;
          </span>
        </button>

        {/* Chat card */}
        <button
          type="button"
          onClick={() => setMode('chat')}
          className="surface-panel group flex flex-col items-center gap-4 rounded-card p-8 text-center transition-all hover:border-sage hover:shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage/10 transition-colors group-hover:bg-sage/20">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-sage"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9" y1="10" x2="9" y2="10" />
              <line x1="12" y1="10" x2="12" y2="10" />
              <line x1="15" y1="10" x2="15" y2="10" />
            </svg>
          </div>
          <h2 className="font-cormorant text-[24px] italic leading-tight text-espresso">
            Answer questions
          </h2>
          <p className="font-serif text-[14px] leading-[1.7] text-driftwood">
            No documents handy? No problem. Our guided chat will walk you through
            seven short sections to build your health profile.
          </p>
          <span className="mt-auto font-serif text-[13px] font-medium text-sage transition-colors group-hover:text-espresso">
            Start the chat &rarr;
          </span>
        </button>
      </div>

      {/* Skip link */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSkip}
          className="font-serif text-[13px] text-sandstone transition-colors hover:text-driftwood"
        >
          Skip for now — I will do this later
        </button>
      </div>
    </div>
  )
}
