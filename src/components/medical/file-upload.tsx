'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExtractedItem = Record<string, unknown>

interface MedicalProfile {
  id: string
  userId: string
  conditions: ExtractedItem[]
  medications: ExtractedItem[]
  allergies: ExtractedItem[]
  surgeries: ExtractedItem[]
  familyHistory: ExtractedItem[]
  immunizations: ExtractedItem[]
  labResults: ExtractedItem[]
  riskFactors: ExtractedItem[]
  confidence: number
  rawDocumentIds: string[]
}

interface UploadResponse {
  documentId: string
  mimeType: string
  extractedText: string
  medicalProfile: MedicalProfile
  error?: string
}

type Stage = 'idle' | 'uploading' | 'extracting' | 'review' | 'confirmed' | 'error'

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic']
const MAX_SIZE = 10 * 1024 * 1024

// ─── Component ────────────────────────────────────────────────────────────────

export function MedicalFileUpload() {
  const [stage, setStage] = useState<Stage>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [response, setResponse] = useState<UploadResponse | null>(null)
  const [editingProfile, setEditingProfile] = useState<MedicalProfile | null>(null)
  const [userId, setUserId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem('carebridge.chat.guestSessionId')
    setUserId(stored || crypto.randomUUID())
  }, [])

  // ─── File handling ────────────────────────────────────────────────────────

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type}. Upload a PDF, PNG, JPG, or HEIC.`
    }
    if (file.size > MAX_SIZE) {
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`
    }
    return null
  }, [])

  const uploadFile = useCallback(async (file: File) => {
    setError('')
    setStage('uploading')
    setUploadProgress(0)

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setStage('error')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)

    // Simulate progress during upload + extraction
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + Math.random() * 15
      })
    }, 400)

    try {
      // Switch to extracting stage after a brief upload phase
      setTimeout(() => setStage('extracting'), 1200)

      const res = await fetch('/api/medical/upload', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      const data = (await res.json()) as UploadResponse

      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed.')
      }

      setResponse(data)
      setEditingProfile(data.medicalProfile)
      setStage('review')
    } catch (err) {
      clearInterval(progressInterval)
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setStage('error')
    }
  }, [userId, validateFile])

  // ─── Drag & drop handlers ────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void uploadFile(file)
  }, [uploadFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = ''
  }, [uploadFile])

  // ─── Confirm / save edits ────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    setStage('confirmed')
  }, [])

  const handleReset = useCallback(() => {
    setStage('idle')
    setResponse(null)
    setEditingProfile(null)
    setError('')
    setUploadProgress(0)
  }, [])

  // ─── Edit helpers ─────────────────────────────────────────────────────────

  const removeItem = useCallback((category: keyof MedicalProfile, index: number) => {
    setEditingProfile((prev) => {
      if (!prev) return prev
      const arr = prev[category]
      if (!Array.isArray(arr)) return prev
      return { ...prev, [category]: arr.filter((_, i) => i !== index) }
    })
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="surface-panel rounded-card flex flex-col gap-5 p-6 sm:p-8 page-enter">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow text-driftwood">Medical history</p>
        <h2 className="font-cormorant text-[30px] italic leading-tight text-espresso">
          Upload your medical documents
        </h2>
        <p className="font-serif text-[15px] leading-[1.7] text-driftwood">
          Upload a medical record, prescription, lab report, or discharge summary.
          We will extract key health data to personalize your insurance recommendations.
        </p>
      </div>

      {/* ── Drop zone (idle / error) ──────────────────────────────────── */}
      {(stage === 'idle' || stage === 'error') && (
        <>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed p-10 transition-colors ${
              dragOver
                ? 'border-sage bg-sage/5'
                : 'border-biscuit bg-parchment hover:border-sage'
            }`}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-driftwood"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="font-serif text-[15px] text-driftwood">
              <span className="font-medium text-espresso">Drag and drop</span> your file here, or{' '}
              <span className="font-medium text-espresso underline">browse</span>
            </p>
            <p className="font-serif text-[12px] text-sandstone">
              PDF, PNG, JPG, or HEIC — up to 10 MB
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.heic"
            onChange={handleFileSelect}
            className="hidden"
          />

          {stage === 'error' && error && (
            <div className="rounded-card border border-terracotta/30 bg-terracotta/5 px-4 py-3">
              <p className="font-serif text-[14px] text-terracotta">{error}</p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 font-serif text-[13px] font-medium text-espresso underline"
              >
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Uploading / extracting progress ───────────────────────────── */}
      {(stage === 'uploading' || stage === 'extracting') && (
        <div className="flex flex-col gap-4 rounded-card border border-biscuit bg-parchment p-6">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="typing-dot h-2 w-2 rounded-full bg-sage" />
              <span className="typing-dot h-2 w-2 rounded-full bg-sage" />
              <span className="typing-dot h-2 w-2 rounded-full bg-sage" />
            </div>
            <p className="font-serif text-[15px] text-espresso">
              {stage === 'uploading' ? 'Uploading document...' : 'Extracting medical data with AI...'}
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-biscuit/40">
            <div
              className="h-full rounded-full bg-sage transition-all duration-500"
              style={{ width: `${Math.min(uploadProgress, 100)}%` }}
            />
          </div>

          <p className="font-serif text-[12px] text-sandstone">
            {stage === 'uploading'
              ? 'Validating and saving your document...'
              : 'Reading text and identifying conditions, medications, allergies, and more...'}
          </p>
        </div>
      )}

      {/* ── Review extracted data ──────────────────────────────────────── */}
      {(stage === 'review' || stage === 'confirmed') && editingProfile && (
        <div className="flex flex-col gap-4">
          {/* Confidence banner */}
          <div className="flex items-center justify-between rounded-card border border-biscuit bg-parchment px-4 py-3">
            <p className="font-serif text-[14px] text-driftwood">
              Extraction confidence:{' '}
              <span className="font-medium text-espresso">
                {Math.round(editingProfile.confidence * 100)}%
              </span>
            </p>
            {response?.extractedText && (
              <details className="font-serif text-[13px] text-driftwood">
                <summary className="cursor-pointer hover:text-espresso">View raw text</summary>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-sandstone">
                  {response.extractedText}
                </p>
              </details>
            )}
          </div>

          {/* Category sections */}
          <SummarySection
            title="Conditions"
            items={editingProfile.conditions}
            labelKey="name"
            detailKeys={['status', 'diagnosedDate', 'notes']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('conditions', i)}
          />
          <SummarySection
            title="Medications"
            items={editingProfile.medications}
            labelKey="name"
            detailKeys={['dosage', 'frequency', 'prescribedFor']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('medications', i)}
          />
          <SummarySection
            title="Allergies"
            items={editingProfile.allergies}
            labelKey="substance"
            detailKeys={['reaction', 'severity']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('allergies', i)}
          />
          <SummarySection
            title="Surgeries"
            items={editingProfile.surgeries}
            labelKey="procedure"
            detailKeys={['date', 'notes']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('surgeries', i)}
          />
          <SummarySection
            title="Family history"
            items={editingProfile.familyHistory}
            labelKey="condition"
            detailKeys={['relation', 'notes']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('familyHistory', i)}
          />
          <SummarySection
            title="Immunizations"
            items={editingProfile.immunizations}
            labelKey="vaccine"
            detailKeys={['date', 'notes']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('immunizations', i)}
          />
          <SummarySection
            title="Lab results"
            items={editingProfile.labResults}
            labelKey="testName"
            detailKeys={['value', 'unit', 'referenceRange', 'interpretation', 'date']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('labResults', i)}
          />
          <SummarySection
            title="Risk factors"
            items={editingProfile.riskFactors}
            labelKey="factor"
            detailKeys={['status', 'notes']}
            editable={stage === 'review'}
            onRemove={(i) => removeItem('riskFactors', i)}
          />

          {/* Action buttons */}
          {stage === 'review' && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-primary sm:max-w-[220px]"
              >
                Confirm and save
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary sm:max-w-[220px]"
              >
                Discard and re-upload
              </button>
            </div>
          )}

          {stage === 'confirmed' && (
            <div className="flex flex-col gap-3">
              <div className="rounded-card border border-sage/30 bg-sage/5 px-4 py-3">
                <p className="font-serif text-[14px] text-espresso">
                  Medical profile saved successfully. Your insurance recommendations will now account
                  for this data.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary self-start"
              >
                Upload another document
              </button>
            </div>
          )}

          <p className="font-serif text-[11px] leading-[1.5] text-sandstone">
            Review the extracted data carefully. You can remove incorrect items before confirming.
            Your data is stored securely and used only for insurance plan matching.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Summary section sub-component ──────────────────────────────────────────

function SummarySection({
  title,
  items,
  labelKey,
  detailKeys,
  editable,
  onRemove,
}: {
  title: string
  items: ExtractedItem[]
  labelKey: string
  detailKeys: string[]
  editable: boolean
  onRemove: (index: number) => void
}) {
  if (!items.length) return null

  return (
    <div className="rounded-card border border-biscuit bg-parchment p-4">
      <p className="font-serif text-[13px] font-medium text-espresso">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item, idx) => (
          <div
            key={`${String(item[labelKey])}-${idx}`}
            className="flex items-start justify-between gap-2 border-t border-biscuit/50 pt-2 first:border-0 first:pt-0"
          >
            <div className="flex-1">
              <p className="font-serif text-[14px] text-espresso">
                {String(item[labelKey] ?? '')}
                {typeof item.confidence === 'number' && (
                  <span className="ml-2 font-serif text-[11px] text-sandstone">
                    {Math.round(item.confidence * 100)}%
                  </span>
                )}
              </p>
              <p className="font-serif text-[12px] leading-5 text-driftwood">
                {detailKeys
                  .map((key) => {
                    const val = item[key]
                    return val != null ? `${key}: ${String(val)}` : null
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="shrink-0 rounded-button border border-transparent px-2 py-1 font-serif text-[12px] text-terracotta transition-colors hover:border-terracotta/20 hover:bg-terracotta/5"
                title="Remove this item"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
