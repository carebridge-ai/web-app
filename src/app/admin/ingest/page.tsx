import { auth } from '@/auth'
import { PlanIngestForm } from '@/components/admin/plan-ingest-form'

function isAdminEmail(email: string | null | undefined) {
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  if (!email) return false
  return allowed.includes(email.toLowerCase())
}

export default async function AdminIngestPage() {
  const session = await auth()
  const isAdmin = isAdminEmail(session?.user?.email)

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:px-6 sm:py-10">
      {isAdmin ? (
        <PlanIngestForm />
      ) : (
        <div className="surface-panel rounded-card mx-auto max-w-2xl p-8 text-center">
          <p className="section-eyebrow text-driftwood">Restricted</p>
          <h1 className="mt-2 font-cormorant text-[32px] italic text-espresso">Admin access required</h1>
          <p className="mt-3 font-serif text-[15px] leading-7 text-driftwood">
            Sign in with an allowed admin email listed in `ADMIN_EMAILS` to ingest Sun Life plan PDFs.
          </p>
        </div>
      )}
    </main>
  )
}
