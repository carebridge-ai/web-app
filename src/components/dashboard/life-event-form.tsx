'use client'

import { useState } from 'react'
import {
  Briefcase,
  Baby,
  Heart,
  MapPin,
  Cake,
  ShieldOff,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LifeEventType =
  | 'job_change'
  | 'new_baby'
  | 'marriage'
  | 'move'
  | 'birthday'
  | 'lost_coverage'

type CategoryScores = {
  hospital: number
  prescriptionDrugs: number
  dental: number
  vision: number
  mentalHealth: number
  emergency: number
}

type CoverageScoreResult = {
  overallScore: number
  categories: CategoryScores
  rationale: string
} | null

const EVENT_OPTIONS: { type: LifeEventType; label: string; icon: typeof Briefcase }[] = [
  { type: 'job_change', label: 'Job change', icon: Briefcase },
  { type: 'new_baby', label: 'New baby', icon: Baby },
  { type: 'marriage', label: 'Marriage', icon: Heart },
  { type: 'move', label: 'Move', icon: MapPin },
  { type: 'birthday', label: 'Birthday', icon: Cake },
  { type: 'lost_coverage', label: 'Lost coverage', icon: ShieldOff },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LifeEventForm({
  onScoreUpdate,
}: {
  onScoreUpdate?: (score: CoverageScoreResult) => void
}) {
  const [selected, setSelected] = useState<LifeEventType | null>(null)
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{
    processed: number
    coverageScore: CoverageScoreResult
  } | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!selected) {
      setError('Choose a life event first.')
      return
    }

    setIsSubmitting(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/retention/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: selected,
          description: description.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as {
        ok?: boolean
        processed?: number
        coverageScore?: CoverageScoreResult
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to log event.')
      }

      setResult({
        processed: payload.processed ?? 0,
        coverageScore: payload.coverageScore ?? null,
      })

      if (payload.coverageScore && onScoreUpdate) {
        onScoreUpdate(payload.coverageScore)
      }

      // Reset form
      setSelected(null)
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="surface-panel rounded-card flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="section-eyebrow text-driftwood">Life changes</p>
        <h3 className="font-cormorant text-[24px] italic leading-tight text-espresso">
          Log a life event
        </h3>
        <p className="font-serif text-[14px] leading-6 text-driftwood">
          Big changes can affect your coverage needs. Log them here and
          we&rsquo;ll update your recommendations.
        </p>
      </div>

      {/* Event type selector */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {EVENT_OPTIONS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelected(type)
              setResult(null)
            }}
            className={`flex flex-col items-center gap-1.5 rounded-card border p-3 transition-colors ${
              selected === type
                ? 'border-sage bg-sage/10'
                : 'border-biscuit bg-parchment hover:border-sage'
            }`}
          >
            <Icon
              size={20}
              className={selected === type ? 'text-espresso' : 'text-driftwood'}
            />
            <span
              className={`font-serif text-[11px] leading-tight ${
                selected === type ? 'font-medium text-espresso' : 'text-driftwood'
              }`}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Optional description */}
      {selected && (
        <label className="flex flex-col gap-2 page-enter">
          <span className="font-serif text-[13px] font-medium text-espresso">
            Details (optional)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={descriptionPlaceholder(selected)}
            className="input-field"
          />
        </label>
      )}

      {/* Submit */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || isSubmitting}
          className="btn-primary sm:max-w-[220px]"
        >
          {isSubmitting ? 'Updating...' : 'Log event'}
        </button>
        {error && (
          <p className="font-serif text-[14px] text-terracotta">{error}</p>
        )}
      </div>

      {/* Result feedback */}
      {result && (
        <div className="rounded-card border border-sage bg-sage/5 p-4 page-enter">
          <p className="font-serif text-[14px] font-medium text-espresso">
            Event logged
          </p>

          {result.coverageScore ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="font-serif text-[14px] text-driftwood">
                Your coverage score has been updated.
              </p>

              {/* Score display */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 ${scoreColor(result.coverageScore.overallScore)}`}
                >
                  <span className="font-serif text-[20px] font-bold">
                    {result.coverageScore.overallScore}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-serif text-[13px] text-driftwood">
                    {result.coverageScore.rationale}
                  </p>
                </div>
              </div>

              {/* Category mini-bars */}
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {(
                  Object.entries(result.coverageScore.categories) as [
                    string,
                    number,
                  ][]
                ).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-16 font-serif text-[11px] text-driftwood">
                      {categoryLabel(key)}
                    </span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-latte">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${barColor(value)}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="w-7 text-right font-serif text-[11px] text-driftwood">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-1 font-serif text-[13px] text-driftwood">
              Complete your medical profile to see how this affects your
              coverage score.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function descriptionPlaceholder(type: LifeEventType): string {
  switch (type) {
    case 'job_change':
      return 'e.g. New employer offers health benefits'
    case 'new_baby':
      return 'e.g. Due date or birth date'
    case 'marriage':
      return 'e.g. Spouse has employer coverage'
    case 'move':
      return 'e.g. Moving from Ontario to BC'
    case 'birthday':
      return 'e.g. Turning 26, aging off parent plan'
    case 'lost_coverage':
      return 'e.g. Employer plan ended March 1'
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return 'border-sage text-sage'
  if (score >= 40) return 'border-sandstone text-sandstone'
  return 'border-terracotta text-terracotta'
}

function barColor(value: number): string {
  if (value >= 70) return 'bg-sage'
  if (value >= 40) return 'bg-sandstone'
  return 'bg-terracotta'
}

function categoryLabel(key: string): string {
  switch (key) {
    case 'hospital':
      return 'Hospital'
    case 'prescriptionDrugs':
      return 'Rx'
    case 'dental':
      return 'Dental'
    case 'vision':
      return 'Vision'
    case 'mentalHealth':
      return 'Mental'
    case 'emergency':
      return 'Emergency'
    default:
      return key
  }
}
