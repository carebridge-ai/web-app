export type ExchangeType = 'federal' | 'state'

export type StateConfig = {
  medicaidExpanded: boolean
  medicaidExpansionDate: string | null
  chipIncomeThreshold: number
  exchangeType: ExchangeType
  exchangeUrl: string
}

export const stateConfigs: Record<string, StateConfig> = {
  AL: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 317, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  AK: { medicaidExpanded: true, medicaidExpansionDate: '2015-09-01', chipIncomeThreshold: 208, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  AZ: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 205, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  AR: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 209, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  CA: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 266, exchangeType: 'state', exchangeUrl: 'https://www.coveredca.com/' },
  CO: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 265, exchangeType: 'state', exchangeUrl: 'https://connectforhealthco.com/' },
  CT: { medicaidExpanded: true, medicaidExpansionDate: '2010-04-01', chipIncomeThreshold: 323, exchangeType: 'state', exchangeUrl: 'https://www.accesshealthct.com/' },
  DE: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 212, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  FL: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 215, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  GA: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 252, exchangeType: 'state', exchangeUrl: 'https://georgiaaccess.gov/' },
  HI: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 313, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  ID: { medicaidExpanded: true, medicaidExpansionDate: '2020-01-01', chipIncomeThreshold: 185, exchangeType: 'state', exchangeUrl: 'https://www.yourhealthidaho.org/' },
  IL: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 318, exchangeType: 'state', exchangeUrl: 'https://getcovered.illinois.gov/' },
  IN: { medicaidExpanded: true, medicaidExpansionDate: '2015-02-01', chipIncomeThreshold: 255, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  IA: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 302, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  KS: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 255, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  KY: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 218, exchangeType: 'state', exchangeUrl: 'https://kynect.ky.gov/' },
  LA: { medicaidExpanded: true, medicaidExpansionDate: '2016-07-01', chipIncomeThreshold: 255, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  ME: { medicaidExpanded: true, medicaidExpansionDate: '2019-01-03', chipIncomeThreshold: 213, exchangeType: 'federal', exchangeUrl: 'https://www.coverme.gov/' },
  MD: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 322, exchangeType: 'state', exchangeUrl: 'https://www.marylandhealthconnection.gov/' },
  MA: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 300, exchangeType: 'state', exchangeUrl: 'https://www.mahealthconnector.org/' },
  MI: { medicaidExpanded: true, medicaidExpansionDate: '2014-04-01', chipIncomeThreshold: 212, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  MN: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 280, exchangeType: 'state', exchangeUrl: 'https://www.mnsure.org/' },
  MS: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 214, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  MO: { medicaidExpanded: true, medicaidExpansionDate: '2021-10-01', chipIncomeThreshold: 305, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  MT: { medicaidExpanded: true, medicaidExpansionDate: '2016-01-01', chipIncomeThreshold: 266, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  NE: { medicaidExpanded: true, medicaidExpansionDate: '2020-10-01', chipIncomeThreshold: 213, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  NV: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 205, exchangeType: 'state', exchangeUrl: 'https://www.nevadahealthlink.com/' },
  NH: { medicaidExpanded: true, medicaidExpansionDate: '2014-08-15', chipIncomeThreshold: 323, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  NJ: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 355, exchangeType: 'state', exchangeUrl: 'https://www.getcovered.nj.gov/' },
  NM: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 305, exchangeType: 'state', exchangeUrl: 'https://bewellnm.com/' },
  NY: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 405, exchangeType: 'state', exchangeUrl: 'https://nystateofhealth.ny.gov/' },
  NC: { medicaidExpanded: true, medicaidExpansionDate: '2023-12-01', chipIncomeThreshold: 211, exchangeType: 'state', exchangeUrl: 'https://www.healthcare.gov/' },
  ND: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 170, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  OH: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 206, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  OK: { medicaidExpanded: true, medicaidExpansionDate: '2021-07-01', chipIncomeThreshold: 210, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  OR: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 300, exchangeType: 'state', exchangeUrl: 'https://healthcare.oregon.gov/' },
  PA: { medicaidExpanded: true, medicaidExpansionDate: '2015-01-01', chipIncomeThreshold: 319, exchangeType: 'state', exchangeUrl: 'https://pennie.com/' },
  RI: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 261, exchangeType: 'state', exchangeUrl: 'https://healthsourceri.com/' },
  SC: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 208, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  SD: { medicaidExpanded: true, medicaidExpansionDate: '2023-07-01', chipIncomeThreshold: 209, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  TN: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 255, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  TX: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 201, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  UT: { medicaidExpanded: true, medicaidExpansionDate: '2020-01-01', chipIncomeThreshold: 205, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  VT: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 317, exchangeType: 'state', exchangeUrl: 'https://info.healthconnect.vermont.gov/' },
  VA: { medicaidExpanded: true, medicaidExpansionDate: '2019-01-01', chipIncomeThreshold: 205, exchangeType: 'state', exchangeUrl: 'https://www.marketplace.virginia.gov/' },
  WA: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 312, exchangeType: 'state', exchangeUrl: 'https://www.wahealthplanfinder.org/' },
  WV: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 305, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  WI: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 306, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  WY: { medicaidExpanded: false, medicaidExpansionDate: null, chipIncomeThreshold: 205, exchangeType: 'federal', exchangeUrl: 'https://www.healthcare.gov/' },
  DC: { medicaidExpanded: true, medicaidExpansionDate: '2014-01-01', chipIncomeThreshold: 324, exchangeType: 'state', exchangeUrl: 'https://dchealthlink.com/' },
} as const
