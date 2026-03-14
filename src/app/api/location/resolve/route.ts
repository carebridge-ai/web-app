import { NextResponse } from 'next/server'
import { z } from 'zod'
import { lookupCountyByZip } from '@/lib/zip-county'

export const runtime = 'nodejs'

const schema = z.object({
  zip: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ZIP payload.' }, { status: 400 })
  }

  const countyFips = lookupCountyByZip(parsed.data.zip)

  return NextResponse.json({
    ok: true,
    zip: parsed.data.zip,
    countyFips,
  })
}
