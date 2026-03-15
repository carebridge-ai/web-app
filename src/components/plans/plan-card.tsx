'use client'

import { useState } from 'react'
import {
  Building2,
  Pill,
  SmilePlus,
  Eye,
  Brain,
  Siren,
  ChevronDown,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Coverage signal level — drives icon color */
export type CoverageLevel = 'good' | 'partial' | 'none'

export type CoverageSignals = {
  hospital: CoverageLevel
  prescriptionDrugs: CoverageLevel
  dental: CoverageLevel
  vision: CoverageLevel
  mentalHealth: CoverageLevel
  emergency: CoverageLevel
}

export type PlanCardProps = {
  /** 1-based rank among returned plans */
  rank: number
  name: string
  carrier: string
  /** One-sentence LLM-generated summary */
  summary: string
  /** 0–100 match score */
  matchScore: number

  // Icon grid data
  coverage: CoverageSignals

  // Money bar data
  monthlyPremium: number
  /** Estimated monthly coverage value (deductible + OOP amortized) */
  coverageValue: number

  // Detail drawer data
  metalTier: string
  planType: string
  deductible: number
  maxOutOfPocket: number
  qualityRating: number | null
  matchReasons: string[]
  brochureUrl: string | null
  formularyUrl: string | null
  providerDirectoryUrl: string | null
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const LEVEL_CLASSES: Record<CoverageLevel, string> = {
  good: 'text-sage',
  partial: 'text-sandstone',
  none: 'text-terracotta',
}

const LEVEL_BG: Record<CoverageLevel, string> = {
  good: 'bg-sage/15',
  partial: 'bg-sandstone/15',
  none: 'bg-terracotta/15',
}

const LEVEL_LABEL: Record<CoverageLevel, string> = {
  good: 'Covered',
  partial: 'Partial',
  none: 'Not covered',
}

// ---------------------------------------------------------------------------
// Icon grid items
// ---------------------------------------------------------------------------

const COVERAGE_ICONS = [
  { key: 'hospital' as const, icon: Building2, label: 'Hospital' },
  { key: 'prescriptionDrugs' as const, icon: Pill, label: 'Rx' },
  { key: 'dental' as const, icon: SmilePlus, label: 'Dental' },
  { key: 'vision' as const, icon: Eye, label: 'Vision' },
  { key: 'mentalHealth' as const, icon: Brain, label: 'Mental' },
  { key: 'emergency' as const, icon: Siren, label: 'Emergency' },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanCard(props: PlanCardProps) {
  const [open, setOpen] = useState(false)

  const {
    rank,
    name,
    carrier,
    summary,
    matchScore,
    coverage,
    monthlyPremium,
    coverageValue,
    metalTier,
    planType,
    deductible,
    maxOutOfPocket,
    qualityRating,
    matchReasons,
    brochureUrl,
    formularyUrl,
    providerDirectoryUrl,
  } = props

  // Money bar percentages (cap at 100%)
  const maxBar = Math.max(monthlyPremium, coverageValue, 1)
  const premiumPct = Math.min((monthlyPremium / maxBar) * 100, 100)
  const valuePct = Math.min((coverageValue / maxBar) * 100, 100)

  // Score circle color
  const scoreColor =
    matchScore >= 70 ? 'border-sage text-sage' :
    matchScore >= 40 ? 'border-sandstone text-sandstone' :
    'border-terracotta text-terracotta'

  return (
    <div
      className={`rounded-card border bg-parchment stagger-item ${
        rank === 1 ? 'border-sage' : 'border-biscuit'
      }`}
      style={{ animationDelay: `${(rank - 1) * 100}ms` }}
    >
      {/* ── Layer 1: Header ─────────────────────────────────── */}
      <div className="flex items-start gap-4 p-5 pb-0">
        {/* Rank badge */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-biscuit bg-ivory font-serif text-[13px] font-medium text-espresso">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-cormorant text-[20px] italic leading-tight text-espresso">
            {name}
          </p>
          <p className="mt-0.5 font-serif text-[13px] leading-6 text-driftwood">
            {carrier}
          </p>
          <p className="mt-1 font-serif text-[14px] leading-[1.6] text-driftwood">
            {summary}
          </p>
        </div>

        {/* Match score circle */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${scoreColor}`}
        >
          <span className="font-serif text-[15px] font-bold">{matchScore}</span>
        </div>
      </div>

      {/* ── Layer 2: Icon grid ──────────────────────────────── */}
      <div className="grid grid-cols-6 gap-2 px-5 pt-4">
        {COVERAGE_ICONS.map(({ key, icon: Icon, label }) => {
          const level = coverage[key]
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-button ${LEVEL_BG[level]}`}
              >
                <Icon size={18} className={LEVEL_CLASSES[level]} />
              </div>
              <span className="font-serif text-[10px] text-driftwood">{label}</span>
              <span className={`font-serif text-[9px] ${LEVEL_CLASSES[level]}`}>
                {LEVEL_LABEL[level]}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Layer 3: Money bar ──────────────────────────────── */}
      <div className="flex flex-col gap-2 px-5 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <span className="font-serif text-[12px] text-driftwood">
            Premium
          </span>
          <span className="font-serif text-[13px] font-medium text-espresso">
            ${monthlyPremium}/mo
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-latte">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-terracotta/60"
            style={{ width: `${premiumPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="font-serif text-[12px] text-driftwood">
            Coverage value
          </span>
          <span className="font-serif text-[13px] font-medium text-espresso">
            ${coverageValue}/mo
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-latte">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-sage/70"
            style={{ width: `${valuePct}%` }}
          />
        </div>
      </div>

      {/* ── Layer 4: Collapsible detail drawer ──────────────── */}
      <div className="border-t border-biscuit">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-ivory/50"
        >
          <span className="font-serif text-[13px] font-medium text-driftwood">
            Full details
          </span>
          <ChevronDown
            size={16}
            className={`text-driftwood transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {open && (
          <div className="flex flex-col gap-3 px-5 pb-5 page-enter">
            {/* Cost breakdown */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-button border border-biscuit bg-ivory p-3">
                <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-sandstone">
                  Premium
                </p>
                <p className="mt-1 font-serif text-[20px] font-bold text-espresso">
                  ${monthlyPremium}
                  <span className="text-[12px] font-normal text-driftwood">/mo</span>
                </p>
              </div>
              <div className="rounded-button border border-biscuit bg-ivory p-3">
                <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-sandstone">
                  Deductible
                </p>
                <p className="mt-1 font-serif text-[20px] font-bold text-espresso">
                  ${deductible.toLocaleString()}
                </p>
              </div>
              <div className="rounded-button border border-biscuit bg-ivory p-3">
                <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-sandstone">
                  Max OOP
                </p>
                <p className="mt-1 font-serif text-[20px] font-bold text-espresso">
                  ${maxOutOfPocket.toLocaleString()}
                </p>
              </div>
              <div className="rounded-button border border-biscuit bg-ivory p-3">
                <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-sandstone">
                  Quality
                </p>
                <p className="mt-1 font-serif text-[20px] font-bold text-espresso">
                  {qualityRating ? `${qualityRating}/5` : '—'}
                </p>
              </div>
            </div>

            {/* Plan metadata */}
            <p className="font-serif text-[13px] text-driftwood">
              {metalTier} · {planType}
            </p>

            {/* Match reasons */}
            {matchReasons.length > 0 && (
              <div className="flex flex-col gap-1">
                {matchReasons.map((reason, i) => (
                  <p
                    key={i}
                    className="font-serif text-[13px] leading-[1.6] text-driftwood"
                  >
                    &bull; {reason}
                  </p>
                ))}
              </div>
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-3 pt-1">
              {brochureUrl && (
                <a
                  href={brochureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-serif text-[12px] text-sage underline"
                >
                  Plan brochure
                </a>
              )}
              {formularyUrl && (
                <a
                  href={formularyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-serif text-[12px] text-sage underline"
                >
                  Drug formulary
                </a>
              )}
              {providerDirectoryUrl && (
                <a
                  href={providerDirectoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-serif text-[12px] text-sage underline"
                >
                  Provider directory
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
