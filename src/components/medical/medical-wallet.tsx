'use client'

import { useEffect, useState } from 'react'
import {
  HeartPulse,
  Pill,
  ShieldAlert,
  Scissors,
  Syringe,
  Phone,
  Pencil,
  Check,
  X,
  Share2,
  Link as LinkIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MedicalItem = Record<string, unknown>

type SectionKey =
  | 'conditions'
  | 'medications'
  | 'allergies'
  | 'surgeries'
  | 'immunizations'
  | 'riskFactors'

type MedicalProfileData = Record<SectionKey, MedicalItem[]> & {
  familyHistory: MedicalItem[]
  labResults: MedicalItem[]
  confidence: number
  lastUpdated: string
}

type SectionConfig = {
  key: SectionKey
  label: string
  icon: typeof HeartPulse
}

const SECTIONS: SectionConfig[] = [
  { key: 'conditions', label: 'Conditions', icon: HeartPulse },
  { key: 'medications', label: 'Medications', icon: Pill },
  { key: 'allergies', label: 'Allergies', icon: ShieldAlert },
  { key: 'surgeries', label: 'Surgeries', icon: Scissors },
  { key: 'immunizations', label: 'Immunizations', icon: Syringe },
  { key: 'riskFactors', label: 'Emergency contacts & risk factors', icon: Phone },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MedicalWallet() {
  const [profile, setProfile] = useState<MedicalProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null)
  const [editBuffer, setEditBuffer] = useState('')
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch('/api/medical/wallet')
      if (!res.ok) {
        if (res.status === 404) {
          setError('No medical profile yet. Complete the medical intake first.')
        } else {
          setError('Failed to load medical profile.')
        }
        return
      }
      const data = (await res.json()) as { profile: MedicalProfileData }
      setProfile(data.profile)
    } catch {
      setError('Failed to load medical profile.')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(section: SectionKey) {
    if (!profile) return
    const items = profile[section] ?? []
    // Convert items to editable text: one item name per line
    const text = items.map(itemName).join('\n')
    setEditBuffer(text)
    setEditingSection(section)
  }

  async function saveEdit() {
    if (!editingSection || !profile) return
    setSaving(true)

    // Convert text lines back to item objects
    const lines = editBuffer
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const items = lines.map((name) => ({ name }))

    try {
      const res = await fetch('/api/medical/wallet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: editingSection, items }),
      })

      if (!res.ok) throw new Error('Save failed')

      // Update local state
      setProfile({ ...profile, [editingSection]: items })
      setEditingSection(null)
    } catch {
      setError('Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleShare() {
    setSharing(true)
    setShareUrl('')

    try {
      const res = await fetch('/api/medical/share', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to generate link')
      const data = (await res.json()) as { token: string }
      const url = `${window.location.origin}/share/${data.token}`
      setShareUrl(url)

      // Copy to clipboard
      await navigator.clipboard.writeText(url).catch(() => {})
    } catch {
      setError('Failed to generate share link.')
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <div className="surface-panel rounded-card p-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sage border-t-transparent" />
          <span className="font-serif text-[14px] text-driftwood">
            Loading medical wallet...
          </span>
        </div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="surface-panel rounded-card p-6">
        <p className="font-serif text-[14px] text-driftwood">{error}</p>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="flex flex-col gap-4 page-enter">
      {/* Header */}
      <div className="surface-panel rounded-card flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <p className="section-eyebrow text-driftwood">Medical wallet</p>
            <h2 className="font-cormorant text-[28px] italic leading-tight text-espresso">
              Your health profile
            </h2>
            <p className="font-serif text-[13px] text-driftwood">
              Last updated{' '}
              {new Date(profile.lastUpdated).toLocaleDateString()}
            </p>
          </div>

          {/* Share button */}
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-pill flex items-center gap-2"
          >
            <Share2 size={14} />
            <span>{sharing ? 'Generating...' : 'Share with Doctor'}</span>
          </button>
        </div>

        {/* Share URL display */}
        {shareUrl && (
          <div className="flex items-center gap-2 rounded-button border border-sage bg-sage/5 px-3 py-2 page-enter">
            <LinkIcon size={14} className="shrink-0 text-sage" />
            <p className="min-w-0 flex-1 truncate font-serif text-[13px] text-espresso">
              {shareUrl}
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="shrink-0 font-serif text-[12px] font-medium text-sage"
            >
              Copy
            </button>
          </div>
        )}

        {error && (
          <p className="font-serif text-[13px] text-terracotta">{error}</p>
        )}
      </div>

      {/* Section cards */}
      {SECTIONS.map(({ key, label, icon: Icon }) => {
        const items = (profile[key] ?? []) as MedicalItem[]
        const isEditing = editingSection === key

        return (
          <div
            key={key}
            className="surface-panel rounded-card flex flex-col gap-3 p-5"
          >
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-driftwood" />
                <h3 className="font-serif text-[14px] font-medium text-espresso">
                  {label}
                </h3>
                <span className="font-serif text-[12px] text-sandstone">
                  ({items.length})
                </span>
              </div>

              {isEditing ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="icon-button"
                    title="Save"
                  >
                    <Check size={14} className="text-sage" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSection(null)}
                    className="icon-button"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(key)}
                  className="icon-button"
                  title={`Edit ${label.toLowerCase()}`}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>

            {/* Content */}
            {isEditing ? (
              <textarea
                value={editBuffer}
                onChange={(e) => setEditBuffer(e.target.value)}
                className="input-field min-h-[120px] resize-y"
                placeholder="One item per line"
              />
            ) : items.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-button border border-biscuit bg-parchment px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[14px] text-espresso">
                        {itemName(item)}
                      </p>
                      {itemDetail(item) && (
                        <p className="font-serif text-[12px] leading-[1.5] text-driftwood">
                          {itemDetail(item)}
                        </p>
                      )}
                    </div>
                    {itemStatus(item) && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-serif text-[10px] uppercase tracking-wider ${statusStyle(itemStatus(item)!)}`}
                      >
                        {itemStatus(item)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-serif text-[13px] italic text-sandstone">
                None recorded
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function itemName(item: MedicalItem): string {
  return String(
    item.name ??
      item.rawText ??
      item.condition ??
      item.substance ??
      item.factor ??
      item.vaccine ??
      'Unknown',
  )
}

function itemDetail(item: MedicalItem): string | null {
  const parts: string[] = []
  if (item.dosage) parts.push(String(item.dosage))
  if (item.frequency) parts.push(String(item.frequency))
  if (item.prescribedFor) parts.push(`for ${item.prescribedFor}`)
  if (item.reaction) parts.push(`Reaction: ${item.reaction}`)
  if (item.severity) parts.push(`Severity: ${item.severity}`)
  if (item.date) parts.push(String(item.date))
  if (item.relation) parts.push(String(item.relation))
  if (item.notes) parts.push(String(item.notes))
  return parts.length > 0 ? parts.join(' · ') : null
}

function itemStatus(item: MedicalItem): string | null {
  const status = item.status as string | undefined
  if (!status) return null
  return status
}

function statusStyle(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
    case 'current':
      return 'bg-sage/15 text-sage'
    case 'resolved':
    case 'former':
      return 'bg-latte text-sandstone'
    case 'suspected':
    case 'unknown':
      return 'bg-sandstone/15 text-sandstone'
    case 'severe':
    case 'critical':
      return 'bg-terracotta/15 text-terracotta'
    default:
      return 'bg-latte text-driftwood'
  }
}
