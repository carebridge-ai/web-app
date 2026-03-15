'use client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanCoverage = {
  planName: string
  /** 0–100 estimated coverage percentage */
  coveragePct: number
}

export type WhatIfScenario = {
  /** e.g. "You need emergency surgery for appendicitis" */
  scenario: string
  /** Per-plan estimated coverage */
  plans: PlanCoverage[]
}

export type WhatIfPanelProps = {
  scenarios: WhatIfScenario[]
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function dotColor(pct: number): string {
  if (pct >= 70) return 'bg-sage'
  if (pct >= 40) return 'bg-sandstone'
  return 'bg-terracotta'
}

function pctColor(pct: number): string {
  if (pct >= 70) return 'text-sage'
  if (pct >= 40) return 'text-sandstone'
  return 'text-terracotta'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatIfPanel({ scenarios }: WhatIfPanelProps) {
  if (scenarios.length === 0) return null

  return (
    <div className="surface-panel rounded-card flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="section-eyebrow text-driftwood">What if</p>
        <h3 className="font-cormorant text-[24px] italic leading-tight text-espresso">
          How each plan handles real situations
        </h3>
        <p className="font-serif text-[14px] leading-6 text-driftwood">
          Based on your medications and health profile, here are scenarios that
          matter to you.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {scenarios.map((sc, idx) => (
          <div
            key={idx}
            className="rounded-card border border-biscuit bg-parchment p-4 stagger-item"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <p className="font-serif text-[14px] font-medium leading-[1.6] text-espresso">
              {sc.scenario}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {sc.plans.map((plan) => (
                <div
                  key={plan.planName}
                  className="flex items-center gap-3"
                >
                  {/* Colored dot */}
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor(plan.coveragePct)}`}
                  />

                  {/* Plan name */}
                  <span className="min-w-0 flex-1 truncate font-serif text-[13px] text-driftwood">
                    {plan.planName}
                  </span>

                  {/* Coverage bar */}
                  <div className="hidden w-24 sm:block">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-latte">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${dotColor(plan.coveragePct)}`}
                        style={{ width: `${Math.min(plan.coveragePct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Percentage */}
                  <span
                    className={`shrink-0 font-serif text-[13px] font-medium ${pctColor(plan.coveragePct)}`}
                  >
                    {plan.coveragePct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="font-serif text-[11px] leading-[1.5] text-sandstone">
        Coverage estimates are illustrative. Actual coverage depends on plan
        terms, network status, and prior authorization requirements.
      </p>
    </div>
  )
}
