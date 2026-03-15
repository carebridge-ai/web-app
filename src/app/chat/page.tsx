import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { ChatTabsLayout } from '@/components/chat/chat-tabs-layout'

export default async function ChatPage() {
  const session = await auth()
  const cookieStore = await cookies()
  const isGuest = cookieStore.get('guest')?.value === '1'
  const visitorLabel = session?.user?.email ?? (isGuest ? 'Guest session' : 'Caregiver')

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:px-6 sm:py-10">
      <ChatTabsLayout
        visitorLabel={visitorLabel}
        isAuthenticated={!!session?.user}
      />
    </main>
  )
}
