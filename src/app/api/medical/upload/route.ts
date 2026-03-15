import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
])

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'medical')

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null)

    if (!formData) {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data.' },
        { status: 400 },
      )
    }

    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing "file" field in form data.' },
        { status: 400 },
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Allowed: PDF, PNG, JPG, HEIC.`,
        },
        { status: 400 },
      )
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
        },
        { status: 400 },
      )
    }

    // Generate a unique document ID and build the file path
    const documentId = randomUUID()
    const ext = extensionForMime(file.type)
    const fileName = `${documentId}${ext}`
    const filePath = path.join(UPLOAD_DIR, fileName)

    // Ensure the upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Write the file to disk
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return NextResponse.json({
      documentId,
      filePath,
      mimeType: file.type,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    console.error('[medical/upload] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf'
    case 'image/png':
      return '.png'
    case 'image/jpeg':
      return '.jpg'
    case 'image/heic':
      return '.heic'
    default:
      return ''
  }
}
