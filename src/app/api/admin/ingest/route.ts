import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { extractTextFromDocument } from '@/lib/medical-extraction'
import { extractPlanFromText, toPlanUpsertData } from '@/lib/plan-ingestion'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const MAX_SIZE_BYTES = 10 * 1024 * 1024
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'plans')

function isAdminEmail(email: string | null | undefined) {
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  if (!email) return false
  return allowed.includes(email.toLowerCase())
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  try {
    const formData = await request.formData().catch(() => null)

    if (!formData) {
      return NextResponse.json({ error: 'Request must be multipart/form-data.' }, { status: 400 })
    }

    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field in form data.' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF uploads are supported.' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` },
        { status: 400 },
      )
    }

    await mkdir(UPLOAD_DIR, { recursive: true })

    const fileName = `${randomUUID()}.pdf`
    const filePath = path.join(UPLOAD_DIR, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const extractedText = await extractTextFromDocument(filePath, 'application/pdf')
    const plan = await extractPlanFromText({
      fileName: file.name || fileName,
      rawText: extractedText,
    })

    const record = await prisma.plan.upsert({
      ...toPlanUpsertData(plan),
    })

    return NextResponse.json({
      ok: true,
      plan,
      record,
      extractedTextPreview: extractedText.slice(0, 1500),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Plan ingestion failed.'
    console.error('[admin/ingest] Error:', err)
    return NextResponse.json({
      error: message,
      details: err instanceof Error ? err.stack : String(err),
    }, { status: 500 })
  }
}
