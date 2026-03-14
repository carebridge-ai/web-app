// Federal Poverty Level guidelines are updated annually by HHS.
// Source: https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines

export const fplThresholds2025 = {
  contiguous48AndDc: {
    base: 15650,
    additionalPerson: 5580,
  },
  alaska: {
    base: 19550,
    additionalPerson: 6980,
  },
  hawaii: {
    base: 17990,
    additionalPerson: 6420,
  },
} as const

export type FplThresholdRegion = keyof typeof fplThresholds2025
