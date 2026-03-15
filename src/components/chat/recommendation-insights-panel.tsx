'use client'

import { useState } from 'react'
import { useProfile } from '@/lib/profile-context'

// ---------------------------------------------------------------------------
// Types matching the API response
// ---------------------------------------------------------------------------

type NarrativeSummary = {
  headline: string
  situationAnalysis: string
  keyInsight: string
  confidenceStatement: string
}

type PlanExplanation = {
  planName: string
  whyRecommended: string
  decisionPathNarrative: string
  strengthsForUser: string[]
  risksOrGaps: string[]
  comparisonNote: string
}

type ScoreComparison = {
  planName: string
  carrier: string
  mlScore: number
  matchLabel: string
  confidence: number
}

type ProbabilityDistribution = {
  planName: string
  excellent: number
  good: number
  fair: number
  poor: number
}

type CostComparison = {
  planName: string
  monthlyCostEstimate: string
  generosity: string
  coverageHighlights: string[]
  gaps: string[]
}

type FeatureImportance = {
  feature: string
  importance: number
  humanLabel: string
}

type DecisionPath = {
  planName: string
  factors: string[]
}

type RadarChart = {
  dimensions: Array<{ dimension: string; description: string }>
  plans: Array<{ planName: string; scores: number[] }>
}

type InsightsData = {
  narrative: NarrativeSummary
  planExplanations: PlanExplanation[]
  visualization: {
    scoreComparison: ScoreComparison[]
    probabilityDistribution: ProbabilityDistribution[]
    costComparison: CostComparison[]
    featureImportances: FeatureImportance[]
    decisionPaths: DecisionPath[]
    radarChart: RadarChart
  }
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const PLAN_COLORS = ['#7c9a6e', '#c4956a', '#8b7355'] // sage, terracotta-ish, driftwood
const MATCH_COLORS: Record<string, string> = {
  excellent: '#7c9a6e',
  good: '#a3b18a',
  fair: '#c4956a',
  poor: '#9e6b5a',
}
const PROB_COLORS = {
  excellent: '#7c9a6e',
  good: '#a3b18a',
  fair: '#deb887',
  poor: '#9e6b5a',
}

// ---------------------------------------------------------------------------
// SVG Radar Chart Component
// ---------------------------------------------------------------------------

function RadarChartSvg({ chart }: { chart: RadarChart }) {
  const { dimensions, plans } = chart
  if (dimensions.length !== 6 || plans.length === 0) return null

  const size = 280
  const cx = size / 2
  const cy = size / 2
  const radius = 110
  const levels = 5

  const angleStep = (2 * Math.PI) / 6
  const startAngle = -Math.PI / 2

  function polarToCart(angle: number, r: number) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  // Build grid lines
  const gridLines = Array.from({ length: levels }, (_, lvl) => {
    const r = (radius * (lvl + 1)) / levels
    const points = Array.from({ length: 6 }, (_, i) => {
      const p = polarToCart(startAngle + i * angleStep, r)
      return `${p.x},${p.y}`
    }).join(' ')
    return <polygon key={lvl} points={points} fill="none" stroke="#d4c5b0" strokeWidth={0.5} opacity={0.6} />
  })

  // Axis lines
  const axes = Array.from({ length: 6 }, (_, i) => {
    const p = polarToCart(startAngle + i * angleStep, radius)
    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#d4c5b0" strokeWidth={0.5} opacity={0.6} />
  })

  // Dimension labels
  const labels = dimensions.map((dim, i) => {
    const labelR = radius + 22
    const p = polarToCart(startAngle + i * angleStep, labelR)
    const anchor = p.x < cx - 5 ? 'end' : p.x > cx + 5 ? 'start' : 'middle'
    return (
      <text
        key={i}
        x={p.x}
        y={p.y}
        textAnchor={anchor}
        dominantBaseline="central"
        className="fill-current text-driftwood"
        style={{ fontSize: '10px', fontFamily: 'serif' }}
      >
        {dim.dimension}
      </text>
    )
  })

  // Plan polygons
  const polygons = plans.map((plan, planIdx) => {
    const points = plan.scores.map((score, i) => {
      const r = (radius * score) / 100
      const p = polarToCart(startAngle + i * angleStep, r)
      return `${p.x},${p.y}`
    }).join(' ')

    const color = PLAN_COLORS[planIdx % PLAN_COLORS.length]

    return (
      <g key={plan.planName}>
        <polygon
          points={points}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={2}
        />
        {plan.scores.map((score, i) => {
          const r = (radius * score) / 100
          const p = polarToCart(startAngle + i * angleStep, r)
          return <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        })}
      </g>
    )
  })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {gridLines}
        {axes}
        {polygons}
        {labels}
      </svg>
      <div className="flex flex-wrap justify-center gap-4">
        {plans.map((plan, idx) => (
          <div key={plan.planName} className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length] }} />
            <span className="font-serif text-[12px] text-driftwood">{plan.planName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score Bar Chart Component
// ---------------------------------------------------------------------------

function ScoreBarChart({ scores }: { scores: ScoreComparison[] }) {
  return (
    <div className="flex flex-col gap-3">
      {scores.map((s, idx) => (
        <div key={s.planName} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-[13px] font-medium text-espresso">{s.planName}</span>
            <span className="font-serif text-[12px] text-driftwood">{s.mlScore}/100</span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-full bg-parchment">
            <div
              className="flex h-full items-center rounded-full px-2 transition-all duration-700"
              style={{
                width: `${Math.max(s.mlScore, 5)}%`,
                backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length],
              }}
            >
              <span className="font-serif text-[10px] font-medium text-white">
                {s.matchLabel} ({s.confidence}%)
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Probability Distribution Chart
// ---------------------------------------------------------------------------

function ProbabilityChart({ distributions }: { distributions: ProbabilityDistribution[] }) {
  return (
    <div className="flex flex-col gap-3">
      {distributions.map((d) => (
        <div key={d.planName} className="flex flex-col gap-1">
          <span className="font-serif text-[13px] font-medium text-espresso">{d.planName}</span>
          <div className="flex h-5 w-full overflow-hidden rounded-full">
            {(['excellent', 'good', 'fair', 'poor'] as const).map((label) => {
              const value = d[label]
              if (value === 0) return null
              return (
                <div
                  key={label}
                  className="flex items-center justify-center"
                  style={{
                    width: `${value}%`,
                    backgroundColor: PROB_COLORS[label],
                    minWidth: value > 0 ? '16px' : 0,
                  }}
                  title={`${label}: ${value}%`}
                >
                  {value >= 12 && (
                    <span className="font-serif text-[9px] font-medium text-white">{value}%</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {(['excellent', 'good', 'fair', 'poor'] as const).map((label) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PROB_COLORS[label] }} />
            <span className="font-serif text-[11px] capitalize text-driftwood">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feature Importance Chart
// ---------------------------------------------------------------------------

function FeatureImportanceChart({ features }: { features: FeatureImportance[] }) {
  const maxImportance = Math.max(...features.map((f) => f.importance), 1)

  return (
    <div className="flex flex-col gap-2">
      {features.map((f, idx) => (
        <div key={f.feature} className="flex items-center gap-3">
          <span className="w-[180px] shrink-0 text-right font-serif text-[12px] text-driftwood">
            {f.humanLabel}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-parchment">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(f.importance / maxImportance) * 100}%`,
                backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length],
                minWidth: '4px',
              }}
            />
          </div>
          <span className="w-[40px] shrink-0 font-serif text-[11px] text-driftwood">{f.importance}%</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Decision Path Component
// ---------------------------------------------------------------------------

function DecisionPathDisplay({ paths }: { paths: DecisionPath[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {paths.map((p, idx) => (
        <div key={p.planName} className="rounded-card border border-biscuit bg-parchment p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length] }} />
            <span className="font-serif text-[13px] font-medium text-espresso">{p.planName}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {p.factors.map((factor, fi) => (
              <div key={fi} className="flex items-start gap-2">
                <span className="mt-0.5 font-serif text-[11px] text-sandstone">{fi + 1}.</span>
                <span className="font-serif text-[12px] leading-[1.5] text-driftwood">{factor}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function RecommendationInsightsPanel() {
  const { profile } = useProfile()
  const [data, setData] = useState<InsightsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

  async function handleGenerate() {
    if (!profile) {
      setError('Complete your profile in onboarding first.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/ml/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to generate insights.')
      }

      setData({
        narrative: payload.narrative,
        planExplanations: payload.planExplanations,
        visualization: payload.visualization,
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Header + trigger */}
      <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="section-eyebrow text-driftwood">ML Insights</p>
          <h2 className="font-cormorant text-[30px] italic leading-tight text-espresso">
            Recommendation deep dive
          </h2>
          <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
            See why the decision tree model chose your top plans. Get LLM-generated explanations,
            comparison charts, and a breakdown of the factors that drove each recommendation.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleGenerate}
            className="btn-primary sm:max-w-[260px]"
            disabled={isLoading}
          >
            {isLoading ? 'Analyzing recommendations...' : 'Generate insights'}
          </button>
          {error && <p className="font-serif text-[14px] text-terracotta">{error}</p>}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 px-1">
            <span className="font-cormorant text-[12px] italic text-driftwood">ML + LLM pipeline</span>
            <div className="flex gap-1">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-driftwood" />
            </div>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* ── Narrative Summary ──────────────────────────────── */}
          <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
            <p className="section-eyebrow text-driftwood">Summary</p>
            <h3 className="font-cormorant text-[24px] italic leading-tight text-espresso">
              {data.narrative.headline}
            </h3>
            <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
              {data.narrative.situationAnalysis}
            </p>
            <div className="rounded-card border border-sage bg-sage/5 p-4">
              <p className="font-serif text-[13px] font-medium text-espresso">Key insight</p>
              <p className="mt-1 font-serif text-[14px] leading-[1.6] text-driftwood">
                {data.narrative.keyInsight}
              </p>
            </div>
            <p className="font-serif text-[12px] leading-[1.5] text-sandstone">
              {data.narrative.confidenceStatement}
            </p>
          </div>

          {/* ── Score Comparison + Radar ─────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface-panel rounded-card flex flex-col gap-4 p-6 page-enter">
              <p className="section-eyebrow text-driftwood">ML scores</p>
              <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
                Plan ranking comparison
              </h3>
              <ScoreBarChart scores={data.visualization.scoreComparison} />
            </div>

            <div className="surface-panel rounded-card flex flex-col gap-4 p-6 page-enter">
              <p className="section-eyebrow text-driftwood">Radar comparison</p>
              <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
                Coverage dimensions
              </h3>
              <RadarChartSvg chart={data.visualization.radarChart} />
            </div>
          </div>

          {/* ── Per-Plan Explanations ────────────────────────────── */}
          <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
            <p className="section-eyebrow text-driftwood">Plan explanations</p>
            <h3 className="font-cormorant text-[24px] italic leading-tight text-espresso">
              Why each plan was recommended
            </h3>

            <div className="flex flex-col gap-3">
              {data.planExplanations.map((plan, idx) => {
                const isExpanded = expandedPlan === plan.planName

                return (
                  <div
                    key={plan.planName}
                    className="rounded-card border bg-parchment transition-colors"
                    style={{ borderColor: isExpanded ? PLAN_COLORS[idx % PLAN_COLORS.length] : '#d4c5b0' }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPlan(isExpanded ? null : plan.planName)}
                      className="flex w-full items-center justify-between p-5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full font-serif text-[13px] font-bold text-white"
                          style={{ backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length] }}
                        >
                          {idx + 1}
                        </div>
                        <span className="font-cormorant text-[18px] italic text-espresso">{plan.planName}</span>
                      </div>
                      <span className="font-serif text-[14px] text-driftwood">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                    </button>

                    {isExpanded && (
                      <div className="flex flex-col gap-4 border-t border-biscuit px-5 pb-5 pt-4">
                        <div>
                          <p className="font-serif text-[13px] font-medium text-espresso">Why recommended</p>
                          <p className="mt-1 font-serif text-[14px] leading-[1.6] text-driftwood">
                            {plan.whyRecommended}
                          </p>
                        </div>

                        <div>
                          <p className="font-serif text-[13px] font-medium text-espresso">Decision path</p>
                          <p className="mt-1 font-serif text-[14px] leading-[1.6] text-driftwood">
                            {plan.decisionPathNarrative}
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="font-serif text-[13px] font-medium text-espresso">Strengths for you</p>
                            <ul className="mt-1 flex flex-col gap-1">
                              {plan.strengthsForUser.map((s, si) => (
                                <li key={si} className="flex items-start gap-2">
                                  <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
                                  <span className="font-serif text-[13px] leading-[1.5] text-driftwood">{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-serif text-[13px] font-medium text-espresso">Risks & gaps</p>
                            <ul className="mt-1 flex flex-col gap-1">
                              {plan.risksOrGaps.length > 0 ? plan.risksOrGaps.map((r, ri) => (
                                <li key={ri} className="flex items-start gap-2">
                                  <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />
                                  <span className="font-serif text-[13px] leading-[1.5] text-driftwood">{r}</span>
                                </li>
                              )) : (
                                <li className="font-serif text-[13px] text-driftwood">No significant gaps identified.</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        <div className="rounded-card border border-biscuit bg-ivory p-3">
                          <p className="font-serif text-[12px] font-medium text-espresso">Compared to other plans</p>
                          <p className="mt-1 font-serif text-[13px] leading-[1.5] text-driftwood">
                            {plan.comparisonNote}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Probability Distribution ─────────────────────────── */}
          <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
            <p className="section-eyebrow text-driftwood">Match confidence</p>
            <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
              Class probability distribution
            </h3>
            <p className="font-serif text-[13px] leading-[1.6] text-driftwood">
              How the decision tree distributed confidence across match quality levels for each plan.
            </p>
            <ProbabilityChart distributions={data.visualization.probabilityDistribution} />
          </div>

          {/* ── Feature Importances + Decision Paths ─────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface-panel rounded-card flex flex-col gap-4 p-6 page-enter">
              <p className="section-eyebrow text-driftwood">Model internals</p>
              <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
                Feature importances
              </h3>
              <p className="font-serif text-[13px] leading-[1.6] text-driftwood">
                Which features the decision tree relied on most when ranking plans.
              </p>
              <FeatureImportanceChart features={data.visualization.featureImportances} />
            </div>

            <div className="surface-panel rounded-card flex flex-col gap-4 p-6 page-enter">
              <p className="section-eyebrow text-driftwood">Cost comparison</p>
              <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
                Coverage & cost at a glance
              </h3>
              <div className="flex flex-col gap-3">
                {data.visualization.costComparison.map((c, idx) => (
                  <div key={c.planName} className="rounded-card border border-biscuit bg-parchment p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length] }} />
                        <span className="font-serif text-[13px] font-medium text-espresso">{c.planName}</span>
                      </div>
                      <span className="font-serif text-[15px] font-bold text-espresso">{c.monthlyCostEstimate}</span>
                    </div>
                    <p className="mt-1 font-serif text-[12px] capitalize text-driftwood">
                      Generosity: {c.generosity}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.coverageHighlights.map((h) => (
                        <span key={h} className="rounded-full bg-sage/15 px-2 py-0.5 font-serif text-[11px] text-sage">
                          {h}
                        </span>
                      ))}
                      {c.gaps.map((g) => (
                        <span key={g} className="rounded-full bg-terracotta/10 px-2 py-0.5 font-serif text-[11px] text-terracotta">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Decision Paths ────────────────────────────────────── */}
          <div className="surface-panel rounded-card flex flex-col gap-4 p-6 sm:p-8 page-enter">
            <p className="section-eyebrow text-driftwood">Decision tree paths</p>
            <h3 className="font-cormorant text-[20px] italic leading-tight text-espresso">
              Key factors per plan
            </h3>
            <p className="font-serif text-[13px] leading-[1.6] text-driftwood">
              The decision factors the tree used when scoring each plan for your profile.
            </p>
            <DecisionPathDisplay paths={data.visualization.decisionPaths} />
          </div>

          {/* ── Disclaimer ────────────────────────────────────────── */}
          <p className="px-2 font-serif text-[11px] leading-[1.5] text-sandstone">
            Insights generated by a machine learning decision tree classifier and the Groq LLM API.
            Scores reflect model confidence, not guaranteed plan quality. Always verify coverage
            details with your provincial health authority or insurance provider before enrolling.
          </p>
        </>
      )}
    </section>
  )
}
