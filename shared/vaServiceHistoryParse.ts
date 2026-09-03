import type { ParsedVaServicePeriodImport } from './vaUserProfileParse'

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function yearFromDate(raw: unknown): number | null {
  const text = readString(raw)
  if (!text) return null
  const match = text.match(/^(\d{4})/)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  return Number.isFinite(year) ? year : null
}

const BRANCH_CODE_MAP: Record<string, string> = {
  A: 'U.S. Army',
  AR: 'U.S. Army',
  ARMY: 'U.S. Army',
  N: 'U.S. Navy',
  NAVY: 'U.S. Navy',
  AF: 'U.S. Air Force',
  AIRFORCE: 'U.S. Air Force',
  'AIR FORCE': 'U.S. Air Force',
  MC: 'U.S. Marine Corps',
  MARINES: 'U.S. Marine Corps',
  'MARINE CORPS': 'U.S. Marine Corps',
  CG: 'U.S. Coast Guard',
  COASTGUARD: 'U.S. Coast Guard',
  SF: 'U.S. Space Force',
  SPACEFORCE: 'U.S. Space Force'
}

function branchFromCode(code: string | undefined): string | undefined {
  if (!code) return undefined
  const normalized = code.trim().toUpperCase().replace(/[^A-Z]/g, '')
  return BRANCH_CODE_MAP[normalized] || BRANCH_CODE_MAP[code.trim().toUpperCase()]
}

function normalizeBranch(attrs: Record<string, unknown>): string | null {
  const branch = readString(attrs.branch_of_service)
    ?? readString(attrs.branchOfService)
    ?? readString(attrs.branchOfServiceText)
    ?? branchFromCode(readString(attrs.branchOfServiceCode))
    ?? readString(attrs.serviceBranch)

  if (!branch) return null

  const component = readString(attrs.component_of_service)
    ?? readString(attrs.componentOfService)
    ?? readString(attrs.serviceType)

  if (component && /reserve|guard|national guard/i.test(component)) {
    if (/national guard/i.test(component)) {
      if (/air/i.test(branch)) return 'Air National Guard'
      return 'Army National Guard'
    }
    if (/reserve/i.test(component) && !/reserve/i.test(branch)) {
      return `${branch} Reserve`.replace(/^U\.S\. /, '').replace(/^(.)/, (_, c) => `U.S. ${c}`)
    }
  }

  return branch.slice(0, 80)
}

function normalizeRank(attrs: Record<string, unknown>): string | null {
  const rank = readString(attrs.pay_grade)
    ?? readString(attrs.payGrade)
    ?? readString(attrs.payGradeCode)
    ?? readString(attrs.rank)
  return rank ? rank.slice(0, 80) : null
}

function readEpisodeAttributes(episode: unknown): Record<string, unknown> {
  const record = readRecord(episode)
  if (!record) return {}
  return readRecord(record.attributes) || record
}

function collectEpisodes(payload: unknown): unknown[] {
  const root = readRecord(payload)
  if (!root) return []

  if (Array.isArray(root.data)) return root.data

  const data = readRecord(root.data)
  if (!data) return []

  if (Array.isArray(data)) return data

  const attrs = readRecord(data.attributes) || data
  for (const key of [
    'serviceHistory',
    'service_history',
    'serviceEpisodes',
    'service_episodes',
    'episodes'
  ] as const) {
    if (Array.isArray(attrs[key])) return attrs[key] as unknown[]
  }

  if (
    attrs.branch_of_service
    || attrs.branchOfService
    || attrs.serviceEpisodeStartDate
    || attrs.start_date
  ) {
    return [attrs]
  }

  return []
}

function parseEpisode(episode: unknown): ParsedVaServicePeriodImport | null {
  const attrs = readEpisodeAttributes(episode)
  const branch = normalizeBranch(attrs)
  const rank = normalizeRank(attrs)
  const startYear = yearFromDate(
    attrs.start_date
    ?? attrs.serviceEpisodeStartDate
    ?? attrs.begin_date
    ?? attrs.startDate
  )
  const endYear = yearFromDate(
    attrs.end_date
    ?? attrs.serviceEpisodeEndDate
    ?? attrs.endDate
  )

  if (!branch && !rank && startYear == null && endYear == null) return null

  return {
    branch,
    rank,
    startYear,
    endYear
  }
}

/** Map `GET /v0/profile/service_history` (or similar) into ClaimBuilder service periods. */
export function parseVaServiceHistoryForImport(payload: unknown): ParsedVaServicePeriodImport[] {
  const episodes = collectEpisodes(payload)
  const periods: ParsedVaServicePeriodImport[] = []

  for (const episode of episodes.slice(0, 6)) {
    const parsed = parseEpisode(episode)
    if (parsed) periods.push(parsed)
  }

  return periods
}
