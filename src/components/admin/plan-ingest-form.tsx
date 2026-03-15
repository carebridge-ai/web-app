'use client'

import { useRef, useState } from 'react'

type IngestResponse = {
  ok?: boolean
  error?: string
  extractedTextPreview?: string
  plan?: Record<string, unknown>
  record?: Record<string, unknown>
}

export function PlanIngestForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<IngestResponse | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const file = inputRef.current?.files?.[0]
    if (!file) {
      setStatus('error')
      setResult({ error: 'Choose a PDF to ingest.' })
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setStatus('uploading')
    setResult(null)

    try {
      const response = await fetch('/api/admin/ingest', {
        method: 'POST',
        body: formData,
      })

      const data = (await response.json()) as IngestResponse

      if (!response.ok) {
        throw new Error(data.error ?? 'Plan ingestion failed.')
      }

      setResult(data)
      setStatus('done')
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Plan ingestion failed.' })
      setStatus('error')
    }
  }

  return (
    <div className="surface-panel rounded-card mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow text-driftwood">Admin tool</p>
        <h1 className="font-cormorant text-[34px] italic leading-tight text-espresso">
          Sun Life plan ingestion
        </h1>
        <p className="max-w-3xl font-serif text-[15px] leading-[1.7] text-driftwood">
          Upload a Sun Life PDF, extract text, normalize it into the Plan schema, and upsert the result into the database.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="rounded-card border border-biscuit bg-parchment p-5">
          <label className="flex cursor-pointer flex-col gap-3 rounded-card border-2 border-dashed border-sage/40 bg-ivory px-5 py-8 text-center transition-colors hover:border-sage">
            <span className="font-serif text-[15px] text-espresso">Choose Sun Life PDF</span>
            <span className="font-serif text-[13px] text-sandstone">
              PDF only, up to 10 MB
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
            />
          </label>

          <div className="mt-4 min-h-10 rounded-card bg-ivory px-4 py-3 font-serif text-[14px] text-driftwood">
            {fileName || 'No file selected yet.'}
          </div>

          <button type="submit" className="btn-primary mt-4 w-full" disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Ingesting...' : 'Upload and ingest'}
          </button>

          {result?.error && (
            <div className="mt-4 rounded-card border border-terracotta/25 bg-terracotta/5 px-4 py-3 font-serif text-[14px] text-terracotta">
              {result.error}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-card border border-biscuit bg-parchment p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Status" value={status} />
            <InfoCard label="Plan code" value={stringValue(result?.record?.planCode)} />
            <InfoCard label="Carrier" value={stringValue(result?.record?.carrier)} />
            <InfoCard label="Updated" value={stringValue(result?.record?.updatedAt)} />
          </div>

          <div className="rounded-card bg-ivory p-4">
            <p className="font-serif text-[13px] font-medium text-espresso">Validated plan payload</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-driftwood">
              {result?.plan ? JSON.stringify(result.plan, null, 2) : 'Ingested plan JSON will appear here.'}
            </pre>
          </div>

          <div className="rounded-card bg-ivory p-4">
            <p className="font-serif text-[13px] font-medium text-espresso">Extracted text preview</p>
            <pre className="mt-3 whitespace-pre-wrap font-serif text-[12px] leading-5 text-driftwood">
              {result?.extractedTextPreview || 'PDF text preview will appear here after upload.'}
            </pre>
          </div>
        </section>
      </form>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-ivory px-4 py-3">
      <p className="font-serif text-[11px] uppercase tracking-[0.14em] text-sandstone">{label}</p>
      <p className="mt-1 font-serif text-[14px] text-espresso">{value}</p>
    </div>
  )
}

function stringValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value
  return '—'
}
