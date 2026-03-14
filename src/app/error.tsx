'use client'

import { PageShell, SurfaceCard } from '@/components/ui/layout-shell'

export default function GlobalError({ error }: { error: Error }) {
  return (
    <PageShell as="div" centered>
      <SurfaceCard className="w-full max-w-lg p-8 text-center">
        <p className="section-eyebrow text-steel">Unexpected error</p>
        <h1 className="mt-2 font-playfair italic text-[28px] leading-[1.2] text-charcoal">
          Something went wrong
        </h1>
        <p className="mt-4 font-sans text-[14px] leading-6 text-steel">
          The page hit a problem and could not finish loading.
        </p>
        <p className="mt-3 font-sans text-[12px] leading-[1.6] text-coral break-words">
          {error.message}
        </p>
      </SurfaceCard>
    </PageShell>
  )
}
