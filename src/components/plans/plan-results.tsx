'use client'

import { PlanCard, type PlanCardProps, type CoverageLevel } from './plan-card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanResultsProps = {
  plans: PlanCardProps[]
}

// ---------------------------------------------------------------------------
// Chart constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'hospital' as const, label: 'Hospital' },
  { key: 'prescriptionDrugs' as const, label: 'Rx' },
  { key: 'dental' as const, label: 'Dental' },
  { key: 'vision' as const, label: 'Vision' },
  { key: 'mentalHealth' as const, label: 'Mental' },
  { key: 'emergency' as const, label: 'Emergency' },
] as const

// Design-system colors (hex values matching CSS custom properties)
const LEVEL_FILL: Record<CoverageLevel, string> = {
  good: '#C2DFD0',     // sage
  partial: '#B8A690',  // sandstone
  none: '#C4785C',     // terracotta
}

const BAR_HEIGHT = 32
const BAR_GAP = 16
const LABEL_WIDTH = 100
const CHART_PADDING_TOP = 8
const SEGMENT_COUNT = CATEGORIES.length

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanResults({ plans }: PlanResultsProps) {
  const top3 = plans.slice(0, 3)

  if (top3.length === 0) return null

  // Chart dimensions
  const barAreaWidth = 1 // will be scaled via viewBox + 100% width
  const chartWidth = 600
  const barWidth = chartWidth - LABEL_WIDTH - 16
  const segmentWidth = barWidth / SEGMENT_COUNT
  const chartHeight =
    CHART_PADDING_TOP + top3.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + 8

  return (
    <div className="flex flex-col gap-6">
      {/* ── Plan cards ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {top3.map((plan) => (
          <PlanCard key={`${plan.name}-${plan.rank}`} {...plan} />
        ))}
      </div>

      {/* ── Comparison chart ────────────────────────────────── */}
      <div className="surface-panel rounded-card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow text-driftwood">Side-by-side</p>
          <h3 className="font-cormorant text-[24px] italic leading-tight text-espresso">
            Coverage at a glance
          </h3>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          <LegendItem color={LEVEL_FILL.good} label="Covered" />
          <LegendItem color={LEVEL_FILL.partial} label="Partial" />
          <LegendItem color={LEVEL_FILL.none} label="Not covered" />
        </div>

        {/* SVG chart */}
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          role="img"
          aria-label="Coverage comparison chart"
        >
          {top3.map((plan, planIdx) => {
            const y = CHART_PADDING_TOP + planIdx * (BAR_HEIGHT + BAR_GAP)

            return (
              <g key={plan.name}>
                {/* Plan label */}
                <text
                  x={0}
                  y={y + BAR_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-espresso"
                  style={{
                    fontFamily: 'var(--font-serif), Georgia, serif',
                    fontSize: '12px',
                  }}
                >
                  {truncate(plan.name, 14)}
                </text>

                {/* Bar background */}
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={barWidth}
                  height={BAR_HEIGHT}
                  rx={6}
                  className="fill-latte"
                />

                {/* Coverage segments */}
                {CATEGORIES.map((cat, catIdx) => {
                  const level = plan.coverage[cat.key]
                  const sx = LABEL_WIDTH + catIdx * segmentWidth
                  // Inset 1px between segments for visual separation
                  const sw = segmentWidth - 1

                  // Round corners on first and last segment
                  const isFirst = catIdx === 0
                  const isLast = catIdx === SEGMENT_COUNT - 1

                  return (
                    <g key={cat.key}>
                      <rect
                        x={sx}
                        y={y}
                        width={sw}
                        height={BAR_HEIGHT}
                        rx={isFirst || isLast ? 6 : 0}
                        fill={LEVEL_FILL[level]}
                      />
                      {/* Category label inside segment */}
                      <text
                        x={sx + sw / 2}
                        y={y + BAR_HEIGHT / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontSize: '10px',
                          fill: '#2C1810',
                          opacity: 0.7,
                        }}
                      >
                        {cat.label}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        <p className="font-serif text-[11px] leading-[1.5] text-sandstone">
          Each bar shows 6 coverage categories. Green means covered, tan means partial, red means not covered.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="font-serif text-[12px] text-driftwood">{label}</span>
    </div>
  )
}

function truncate(str: string, max: number) {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '\u2026'
}
