import fs from 'fs/promises'
import path from 'path'

const token = process.env.HUD_API_TOKEN
const year = process.env.HUD_ZIP_CROSSWALK_YEAR
const quarter = process.env.HUD_ZIP_CROSSWALK_QUARTER

if (!token) {
  console.error('HUD_API_TOKEN is required to fetch ZIP-to-county data from HUD.')
  process.exit(1)
}

const params = new URLSearchParams({
  type: '2',
  query: 'All',
})

if (year) {
  params.set('year', year)
}

if (quarter) {
  params.set('quarter', quarter)
}

const response = await fetch(`https://www.huduser.gov/hudapi/public/usps?${params.toString()}`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
})

if (!response.ok) {
  const message = await response.text()
  throw new Error(`HUD API request failed: ${response.status} ${message}`)
}

const payload = await response.json()
const rows = Array.isArray(payload.data?.results)
  ? payload.data.results
  : Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.data)
      ? payload.data
      : []

const lookup = {}

for (const row of rows) {
  const zip = String(row.zip ?? row.ZIP ?? '').padStart(5, '0')
  const county = String(
    row.county ?? row.COUNTY ?? row.geoid ?? row.GEOID ?? row.stcounty ?? row.STCOUNTY ?? '',
  ).padStart(5, '0')
  const ratio = Number(row.tot_ratio ?? row.TOT_RATIO ?? row.res_ratio ?? row.RES_RATIO ?? 0)

  if (!zip || !county) {
    continue
  }

  if (!lookup[zip] || ratio > lookup[zip].ratio) {
    lookup[zip] = {
      county,
      ratio,
    }
  }
}

const outputPath = path.resolve(process.cwd(), 'src/data/zip-to-county.ts')
const lines = [
  '// Generated from the HUD USPS ZIP Code Crosswalk API.',
  '// Requires HUD_API_TOKEN to refresh. See scripts/fetch-hud-zip-crosswalk.mjs.',
  'export const zipToCounty: Record<string, string> = ' + JSON.stringify(
    Object.fromEntries(Object.entries(lookup).map(([zip, value]) => [zip, value.county])),
    null,
    2,
  ) + ' as const',
  '',
]

await fs.writeFile(outputPath, lines.join('\n'), 'utf8')
console.log(`Wrote ${Object.keys(lookup).length} ZIP mappings to ${outputPath}`)
