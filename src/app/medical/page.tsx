import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { MedicalRouteSelector } from '@/components/medical/route-selector'

export default async function MedicalPage() {
  const session = await auth()
  const cookieStore = await cookies()
  const isGuest = cookieStore.get('guest')?.value === '1'
  const visitorLabel = session?.user?.email ?? (isGuest ? 'Guest session' : 'Caregiver')

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:px-6 sm:py-10">
      <MedicalRouteSelector visitorLabel={visitorLabel} />
    </main>
  )
}
