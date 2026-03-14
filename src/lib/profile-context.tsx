'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { UserProfile } from './profile'

interface ProfileContextValue {
  profile: UserProfile | null
  setProfile: (p: UserProfile) => void
  clearProfile: () => void
  isLoading: boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch('/api/profile')

        if (response.ok) {
          const data = (await response.json()) as { profile?: UserProfile }

          if (data.profile) {
            setProfileState(data.profile)

            // Sync language to localStorage so it's available everywhere
            if (data.profile.language) {
              localStorage.setItem('lang', data.profile.language)
            }
          }
        }
      } catch {
        // Not authenticated or profile doesn't exist — that's fine
      } finally {
        setIsLoading(false)
      }
    }

    void loadProfile()
  }, [])

  const setProfile = useCallback((p: UserProfile) => {
    setProfileState(p)

    // Keep localStorage in sync with profile language
    if (p.language) {
      localStorage.setItem('lang', p.language)
    }
  }, [])

  const clearProfile = useCallback(() => {
    setProfileState(null)
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, setProfile, clearProfile, isLoading }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
