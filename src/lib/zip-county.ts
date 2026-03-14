import 'server-only'

import { zipToCounty } from '@/data/zip-to-county'

export function normalizeZip(zip: string) {
  const digits = zip.replace(/\D/g, '')
  return digits.length >= 5 ? digits.slice(0, 5) : null
}

export function lookupCountyByZip(zip: string) {
  const normalizedZip = normalizeZip(zip)

  if (!normalizedZip) {
    return null
  }

  return zipToCounty[normalizedZip] ?? null
}
