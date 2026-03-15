'use client'

import { PageShell, SurfaceCard } from '@/components/ui/layout-shell'

export default function GlobalError({ error }: { error: Error }) {
  return (
    <PageShell as="div" centered>
      <SurfaceCard className="w-full max-w-lg p-8 text-center">
        <p className="section-eyebrow text-driftwood">Unexpected error</p>
        <h1 className="mt-2 font-cormorant italic text-[28px] leading-[1.2] text-espresso">
          Something went wrong
        </h1>
        <p className="mt-4 font-serif text-[14px] leading-6 text-driftwood">
          The page hit a problem and could not finish loading.
        </p>
        <p className="mt-3 font-serif text-[12px] leading-[1.6] text-terracotta break-words">
          {error.message}
        </p>
      </SurfaceCard>
    </PageShell>
  )
}
