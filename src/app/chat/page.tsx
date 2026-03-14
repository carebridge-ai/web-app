import Link from 'next/link'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { ChatWorkspace } from '@/components/chat/chat-workspace'
import { PlanRecommendationPanel } from '@/components/chat/plan-recommendation-panel'
import { SurfaceCard } from '@/components/ui/layout-shell'

export default async function ChatPage() {
  const session = await auth()
  const cookieStore = await cookies()
  const isGuest = cookieStore.get('guest')?.value === '1'
  const visitorLabel = session?.user?.email ?? (isGuest ? 'Guest session' : 'Caregiver')

  return (
    <main className="min-h-screen bg-ivory px-6 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <SurfaceCard className="flex flex-col gap-5 p-6 sm:p-8 page-enter">
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
                {session?.user ? 'Authenticated with NextAuth session.' : 'Guest access via local guest cookie.'}
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

          <PlanRecommendationPanel />

          <ChatWorkspace />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/onboarding" className="btn-primary flex items-center justify-center sm:max-w-[220px]">
              Review onboarding
            </Link>
            <Link href="/" className="btn-secondary flex items-center justify-center sm:max-w-[220px]">
              Back to home
            </Link>
          </div>
        </SurfaceCard>
      </div>
    </main>
  )
}
