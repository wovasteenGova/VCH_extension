import type { ParsedVaAppeal } from './vaAppealParse'
import { mergeParsedClaims, type ParsedVaClaim } from './vaClaimParse'
import type { ParsedVaRating } from './vaRatingParse'
import type { ParsedVaUserProfileForImport } from './vaUserProfileParse'
import { mergeVaUserProfileImports } from './vaUserProfileParse'

export const VA_DEVICE_CACHE_STORAGE_KEY = 'vch-va-device-cache-v1'

const CACHE_KEY = VA_DEVICE_CACHE_STORAGE_KEY

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
  profile: ParsedVaUserProfileForImport | null
}

const EMPTY_CACHE: VaDeviceCache = {
  lastSyncedAt: null,
  vaLabel: null,
  claims: [],
  appeals: [],
  ratings: null,
  profile: null
}

export function parseVaDeviceCacheRecord(raw: unknown): VaDeviceCache {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CACHE }
  const record = raw as Partial<VaDeviceCache>
  return {
    lastSyncedAt: typeof record.lastSyncedAt === 'string' ? record.lastSyncedAt : null,
    vaLabel: typeof record.vaLabel === 'string' ? record.vaLabel : null,
    claims: Array.isArray(record.claims) ? record.claims as ParsedVaClaim[] : [],
    appeals: Array.isArray(record.appeals) ? record.appeals as ParsedVaAppeal[] : [],
    ratings: record.ratings && typeof record.ratings === 'object'
      ? record.ratings as VaDeviceRatingsCache
      : null,
    profile: record.profile && typeof record.profile === 'object'
      ? record.profile as ParsedVaUserProfileForImport
      : null
  }
}

function storageGet(): Promise<VaDeviceCache> {
  if (!browser.storage?.local?.get) return Promise.resolve({ ...EMPTY_CACHE })

  return browser.storage.local.get(CACHE_KEY).then((result) => {
    return parseVaDeviceCacheRecord(result[CACHE_KEY])
  }).catch(() => ({ ...EMPTY_CACHE }))
}

function storageSet(cache: VaDeviceCache): Promise<boolean> {
  if (!browser.storage?.local?.set) return Promise.resolve(false)
  return browser.storage.local.set({ [CACHE_KEY]: cache }).then(() => true).catch(() => false)
}

export async function readVaDeviceCache(): Promise<VaDeviceCache> {
  return storageGet()
}

export type VaCacheMeta = {
  lastSyncedAt: string | null
  vaLabel: string | null
  hasClaims: boolean
  hasAppeals: boolean
  hasRatings: boolean
  hasProfile: boolean
  hasAny: boolean
}

export function cacheMetaFromDevice(cache: VaDeviceCache): VaCacheMeta {
  const hasClaims = cache.claims.length > 0
  const hasAppeals = cache.appeals.length > 0
  const hasRatings = Boolean(cache.ratings && (cache.ratings.rows.length || cache.ratings.combinedRating != null))
  const hasProfile = Boolean(cache.profile && (
    cache.profile.dateOfBirth
    || cache.profile.phone
    || cache.profile.fullName
    || cache.profile.lastFourSsn
    || cache.profile.servicePeriods?.length
  ))
  return {
    lastSyncedAt: cache.lastSyncedAt,
    vaLabel: cache.vaLabel,
    hasClaims,
    hasAppeals,
    hasRatings,
    hasProfile,
    hasAny: hasClaims || hasAppeals || hasRatings || hasProfile
  }
}

export async function readVaCacheMeta(): Promise<VaCacheMeta> {
  return cacheMetaFromDevice(await storageGet())
}

/** Header chip text — say what is actually saved, not a blanket "everything is cached". */
export function describeSavedVaCache(meta: VaCacheMeta) {
  const parts: string[] = []
  if (meta.hasClaims) parts.push('claims')
  if (meta.hasRatings) parts.push('ratings')
  if (meta.hasAppeals) parts.push('appeals')
  if (meta.hasProfile) parts.push('profile')

  if (!parts.length) {
    return {
      label: 'VA sign-in',
      title: 'Sign in at VA.gov to save claim data on this device.'
    }
  }

  const synced = formatLastSynced(meta.lastSyncedAt)
  const list = parts.join(', ')
  const title = synced
    ? `Saved on this device: ${list}. Last synced ${synced}. Sign in at VA.gov for the latest.`
    : `Saved on this device: ${list}. Sign in at VA.gov for the latest.`

  if (parts.length === 1) {
    const only = parts[0]
    return {
      label: `${only.charAt(0).toUpperCase()}${only.slice(1)} saved`,
      title
    }
  }

  return { label: 'VA data saved', title }
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

export async function saveVaClaimsCache(claims: ParsedVaClaim[]): Promise<boolean> {
  const current = await storageGet()
  if (claims.length === 0 && current.claims.length > 0) return true
  return storageSet({
    ...current,
    claims: mergeParsedClaims(current.claims, claims),
    lastSyncedAt: new Date().toISOString()
  })
}

export async function saveVaAppealsCache(appeals: ParsedVaAppeal[]): Promise<boolean> {
  const current = await storageGet()
  if (appeals.length === 0 && current.appeals.length > 0) return true
  return storageSet({
    ...current,
    appeals,
    lastSyncedAt: new Date().toISOString()
  })
}

export async function saveVaRatingsCache(ratings: VaDeviceRatingsCache): Promise<boolean> {
  const current = await storageGet()
  const incomingEmpty = !ratings.rows.length && ratings.combinedRating == null
  const currentHas = Boolean(current.ratings && (current.ratings.rows.length || current.ratings.combinedRating != null))
  if (incomingEmpty && currentHas) return true
  return storageSet({
    ...current,
    ratings,
    lastSyncedAt: new Date().toISOString()
  })
}

export async function saveVaProfileCache(profile: ParsedVaUserProfileForImport) {
  const current = await storageGet()
  const merged = mergeVaUserProfileImports(current.profile, profile)
  if (!merged) return
  await storageSet({
    ...current,
    profile: merged,
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

export function subscribeVaDeviceCache(listener: (cache: VaDeviceCache) => void) {
  const handler = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local') return
    const change = changes[CACHE_KEY]
    if (!change?.newValue) return
    listener(parseVaDeviceCacheRecord(change.newValue))
  }

  if (!browser.storage?.onChanged?.addListener) return () => undefined
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}

const FRESH_DEVICE_SYNC_MS = 15 * 60 * 1000

export function isRecentVaDeviceSync(lastSyncedAt: string | null | undefined, maxAgeMs = FRESH_DEVICE_SYNC_MS) {
  if (!lastSyncedAt) return false
  const parsed = Date.parse(lastSyncedAt)
  return Number.isFinite(parsed) && Date.now() - parsed <= maxAgeMs
}

export function staleSyncDescription(lastSyncedAt: string | null | undefined) {
  const formatted = formatLastSynced(lastSyncedAt)
  if (formatted) {
    return `Showing data saved on this device. Last synced ${formatted}. Sign in at VA.gov to refresh.`
  }
  return 'Showing data saved on this device. Sign in at VA.gov to refresh.'
}
