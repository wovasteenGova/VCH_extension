import type { ParsedVaAppeal } from './vaAppealParse'
import type { ParsedVaClaim } from './vaClaimParse'
import type { ParsedVaRating } from './vaRatingParse'

const CACHE_KEY = 'vch-va-device-cache-v1'

export type VaDeviceRatingsCache = {
  combinedRating: number | null
  combinedEffectiveDate?: string
  rows: ParsedVaRating[]
}

export type VaDeviceCache = {
  lastSyncedAt: string | null
  vaLabel: string | null
  claims: ParsedVaClaim[]
  appeals: ParsedVaAppeal[]
  ratings: VaDeviceRatingsCache | null
}

const EMPTY_CACHE: VaDeviceCache = {
  lastSyncedAt: null,
  vaLabel: null,
  claims: [],
  appeals: [],
  ratings: null
}

function storageGet(): Promise<VaDeviceCache> {
  if (!browser.storage?.local?.get) return Promise.resolve({ ...EMPTY_CACHE })

  return browser.storage.local.get(CACHE_KEY).then((result) => {
    const raw = result[CACHE_KEY]
    if (!raw || typeof raw !== 'object') return { ...EMPTY_CACHE }
    const record = raw as Partial<VaDeviceCache>
    return {
      lastSyncedAt: typeof record.lastSyncedAt === 'string' ? record.lastSyncedAt : null,
      vaLabel: typeof record.vaLabel === 'string' ? record.vaLabel : null,
      claims: Array.isArray(record.claims) ? record.claims as ParsedVaClaim[] : [],
      appeals: Array.isArray(record.appeals) ? record.appeals as ParsedVaAppeal[] : [],
      ratings: record.ratings && typeof record.ratings === 'object'
        ? record.ratings as VaDeviceRatingsCache
        : null
    }
  })
}

function storageSet(cache: VaDeviceCache): Promise<void> {
  if (!browser.storage?.local?.set) return Promise.resolve()
  return browser.storage.local.set({ [CACHE_KEY]: cache })
}

export async function readVaDeviceCache(): Promise<VaDeviceCache> {
  return storageGet()
}

export async function readVaCacheMeta() {
  const cache = await storageGet()
  return {
    lastSyncedAt: cache.lastSyncedAt,
    vaLabel: cache.vaLabel,
    hasClaims: cache.claims.length > 0,
    hasAppeals: cache.appeals.length > 0,
    hasRatings: Boolean(cache.ratings && (cache.ratings.rows.length || cache.ratings.combinedRating != null)),
    hasAny: cache.claims.length > 0
      || cache.appeals.length > 0
      || Boolean(cache.ratings && (cache.ratings.rows.length || cache.ratings.combinedRating != null))
  }
}

async function patchCache(patch: Partial<VaDeviceCache>) {
  const current = await storageGet()
  await storageSet({ ...current, ...patch })
}

export async function touchVaCacheSync(meta?: { vaLabel?: string | null }) {
  await patchCache({
    lastSyncedAt: new Date().toISOString(),
    ...(meta?.vaLabel !== undefined ? { vaLabel: meta.vaLabel } : {})
  })
}

export async function saveVaClaimsCache(claims: ParsedVaClaim[]) {
  const current = await storageGet()
  await storageSet({
    ...current,
    claims,
    lastSyncedAt: new Date().toISOString()
  })
}

export async function saveVaAppealsCache(appeals: ParsedVaAppeal[]) {
  const current = await storageGet()
  await storageSet({
    ...current,
    appeals,
    lastSyncedAt: new Date().toISOString()
  })
}

export async function saveVaRatingsCache(ratings: VaDeviceRatingsCache) {
  const current = await storageGet()
  await storageSet({
    ...current,
    ratings,
    lastSyncedAt: new Date().toISOString()
  })
}

export function formatLastSynced(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed)
}

export function staleSyncDescription(lastSyncedAt: string | null | undefined) {
  const formatted = formatLastSynced(lastSyncedAt)
  if (formatted) {
    return `Showing data saved on this device. Last synced ${formatted}. Sign in at VA.gov to refresh.`
  }
  return 'Showing data saved on this device. Sign in at VA.gov to refresh.'
}
