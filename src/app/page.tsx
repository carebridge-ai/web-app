'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useGuest } from '@/lib/guest-context'
import { useProfile } from '@/lib/profile-context'
import { getTranslation } from '@/lib/translations'

const TICK_MS = 120
const BLINK_AFTER_MS = 1200

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'pt', label: 'Português' },
]

export default function Home() {
  const router = useRouter()
  const { setGuest } = useGuest()
  const { profile } = useProfile()

  const [typed, setTyped] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [selectedLang, setSelectedLang] = useState('en')
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  const t = useMemo(() => getTranslation(selectedLang), [selectedLang])

  useEffect(() => {
    // Load language: prefer saved profile language, then localStorage
    const profileLang = profile?.language
    const savedLang = localStorage.getItem('lang')
    const lang = profileLang || savedLang
    if (lang) setSelectedLang(lang)
  }, [])

  // Restart typewriter whenever language changes
  useEffect(() => {
    const word = t.headline2
    setTyped('')
    setCursorVisible(true)
    if (intervalRef.current) clearInterval(intervalRef.current)

    let index = 0
    intervalRef.current = setInterval(() => {
      index += 1
      setTyped(word.slice(0, index))
      if (index === word.length) {
        clearInterval(intervalRef.current!)
        setTimeout(() => setCursorVisible(false), BLINK_AFTER_MS)
      }
    }, TICK_MS)
    return () => clearInterval(intervalRef.current!)
  }, [t])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLang(code: string) {
    setSelectedLang(code)
    localStorage.setItem('lang', code)
    setLangOpen(false)
  }

  function handleGuest() {
    setGuest()
    router.push('/onboarding')
  }

  return (
    <main dir={selectedLang === 'ar' ? 'rtl' : 'ltr'} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1476703993599-0035a21b17a9?auto=format&fit=crop&w=1920&q=80"
        alt="Family walking together at sunset"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />

      <div className="absolute inset-0 bg-mahogany home-overlay" />
      <div className="absolute inset-0 ambient-grid opacity-80" />
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-mahogany/20 to-transparent" />

      <div className="relative z-10 w-full max-w-6xl px-6 py-8 md:py-14">
        <div className="fade-rise flex flex-wrap items-center justify-center gap-2 md:justify-start">
          {t.trustPoints.map((point) => (
            <span
              key={point}
              className="trust-pill rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream-text/90"
            >
              {point}
            </span>
          ))}
        </div>

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="fade-rise delay-1 max-w-3xl text-center lg:text-left">
            <span className="home-brand text-cream-text">CareBridge AI</span>
            <h1 className="home-headline mt-5 text-cream-text">
              {t.headline1}
              <br />
              <span>
                {typed}
                {cursorVisible && <span className="home-cursor">|</span>}
              </span>
            </h1>
            <p className="home-caveat mt-3 text-cream-text/85">
              {t.tagline}
            </p>
            <p className="home-subtitle mt-4 max-w-2xl text-cream-text/82">
              {t.subtitle}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="/auth"
                className="flex items-center justify-center h-12 px-8 rounded-full bg-mahogany text-cream-text text-[14px] font-semibold font-serif transition-all duration-150 hover:border-sage border border-transparent"
              >
                {t.getStarted}
              </Link>
              <button
                type="button"
                onClick={handleGuest}
                className="flex items-center justify-center h-12 px-8 rounded-full border border-cream-text/30 bg-cream-text/8 text-cream-text text-[14px] font-serif transition-colors duration-150 hover:bg-cream-text/14"
              >
                {t.tryAsGuest}
              </button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {t.quickFacts.map((fact) => (
                <div key={fact.label} className="home-stat rounded-card px-4 py-4 text-left text-cream-text">
                  <div className="font-cormorant text-2xl italic leading-none">{fact.value}</div>
                  <p className="mt-2 text-[12px] leading-5 text-cream-text/72 font-serif">{fact.label}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="fade-rise delay-2 glass-panel rounded-card p-5 text-left sm:p-6 overflow-visible">
            <p className="section-eyebrow text-cream-text/70">{t.langPanelEyebrow}</p>
            <h2 className="mt-2 font-cormorant text-[30px] italic leading-tight text-cream-text">
              {t.langPanelHeadline}
            </h2>
            <p className="mt-3 font-serif text-[14px] leading-6 text-cream-text/76">
              {t.langPanelDescription}
            </p>

            <div ref={langRef} className="relative mt-4">
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-button border lang-card-active px-4 py-3 text-[14px] font-serif text-espresso"
              >
                {LANGUAGES.find((l) => l.code === selectedLang)?.label ?? 'English'}
                <svg
                  className={`ml-2 h-4 w-4 transition-transform ${langOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {langOpen && (
                <ul className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-card border border-cream-text/20 bg-parchment shadow-lg">
                  {LANGUAGES.map(({ code, label }) => (
                    <li key={code}>
                      <button
                        type="button"
                        onClick={() => handleLang(code)}
                        className={`w-full px-4 py-2.5 text-left text-[14px] font-serif transition-colors ${
                          selectedLang === code
                            ? 'bg-mahogany/10 text-espresso font-semibold'
                            : 'text-espresso hover:bg-mahogany/5'
                        }`}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>

      <p className="absolute bottom-4 inset-x-0 text-center font-serif home-disclaimer">
        {t.disclaimer}
      </p>
    </main>
  )
}
