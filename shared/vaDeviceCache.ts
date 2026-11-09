import { hasLocalDataConsent, revokeCloudConsent } from './privacyConsent'
import { currentVaCacheEpoch } from './vaAccount'
import type { ParsedVaAppeal } from './vaAppealParse'
import type { VaLetterIndexRow } from './vaClaimLetters'
import { mergeParsedClaims, type ParsedVaClaim } from './vaClaimParse'
import type { ParsedVaRating } from './vaRatingParse'
import type { ParsedVaUserProfileForImport } from './vaUserProfileParse'
import { mergeVaUserProfileImports } from './vaUserProfileParse'

export const VA_DEVICE_CACHE_STORAGE_KEY = 'vch-va-device-cache-v1'
export const VA_CACHE_OWNER_KEY = 'vch-va-cache-owner-v1'

const CACHE_KEY = VA_DEVICE_CACHE_STORAGE_KEY

export type VaDeviceRatingsCache = {
  combinedRating: number | null
  combinedEffectiveDate?: string
  rows: ParsedVaRating[]
  fetchedAt?: string
}

export type VaDeviceCache = {
  lastSyncedAt: string | null
  vaLabel: string | null
  claims: ParsedVaClaim[]
  appeals: ParsedVaAppeal[]
  ratings: VaDeviceRatingsCache | null
  profile: ParsedVaUserProfileForImport | null
  letters: { rows: VaLetterIndexRow[], fetchedAt: string } | null
}

const EMPTY_CACHE: VaDeviceCache = {
  lastSyncedAt: null,
  vaLabel: null,
  claims: [],
  appeals: [],
  ratings: null,
  profile: null,
  letters: null
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
      : null,
    letters: Array.isArray(record.letters?.rows) && typeof record.letters.fetchedAt === 'string' ? record.letters : null
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
  return await hasLocalDataConsent() ? storageGet() : { ...EMPTY_CACHE }
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
  return cacheMetaFromDevice(await readVaDeviceCache())
}

/** Header chip text: say what is actually saved, not a blanket "everything is cached". */
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
    const only = parts[0]!
    return {
      label: `${only.charAt(0).toUpperCase()}${only.slice(1)} saved`,
      title
    }
  }

  return { label: 'VA data saved', title }
}

export const VA_CACHE_WRITE = 'VCH_VA_CACHE_WRITE'
type CacheMutation = { field: 'claims' | 'appeals' | 'ratings' | 'profile' | 'letters' | 'meta', value: unknown, ownerEpoch?: string | null }
let writes: Promise<unknown> = Promise.resolve()

export async function checkVaCacheEpoch(epoch: unknown) {
  const owner = (await browser.storage.local.get(VA_CACHE_OWNER_KEY))[VA_CACHE_OWNER_KEY] as { epoch?: string } | undefined
  return typeof epoch === 'string' && owner?.epoch === epoch
}

export function establishVaCacheOwner(accountId: string): Promise<string | null> {
  const next = writes.then(async () => {
    if (!await hasLocalDataConsent() || !/^[a-z0-9-]{8,100}$/i.test(accountId)) return null
    const stored = await browser.storage.local.get([VA_CACHE_OWNER_KEY, CACHE_KEY])
    const owner = stored[VA_CACHE_OWNER_KEY] as { accountId?: string, epoch?: string } | undefined
    if (owner?.accountId === accountId && typeof owner.epoch === 'string') return owner.epoch
    if (owner || stored[CACHE_KEY]) await revokeCloudConsent()
    await browser.storage.local.remove(CACHE_KEY)
    const epoch = crypto.randomUUID()
    await browser.storage.local.set({ [VA_CACHE_OWNER_KEY]: { accountId, epoch } })
    return epoch
  }).catch(() => null)
  writes = next
  return next
}

/** All contexts send mutations here in the worker, preventing lost concurrent writes. */
export function applyVaCacheMutation(mutation: CacheMutation): Promise<boolean> {
  const next = writes.then(async () => {
    if (!await hasLocalDataConsent() || !await checkVaCacheEpoch(mutation.ownerEpoch)) return false
    const current = await storageGet()
    const { field, value } = mutation
    let patch: Partial<VaDeviceCache>
    if (field === 'claims' && Array.isArray(value)) patch = { claims: mergeParsedClaims(current.claims, value) }
    else if (field === 'appeals' && Array.isArray(value)) patch = { appeals: value }
    else if (field === 'ratings' && value && typeof value === 'object' && Array.isArray((value as VaDeviceRatingsCache).rows)) {
      patch = { ratings: { ...(value as VaDeviceRatingsCache), fetchedAt: new Date().toISOString() } }
    }
    else if (field === 'profile' && value && typeof value === 'object') patch = { profile: mergeVaUserProfileImports(current.profile, value as ParsedVaUserProfileForImport) }
    else if (field === 'letters' && Array.isArray(value)) patch = { letters: { rows: value, fetchedAt: new Date().toISOString() } }
    else if (field === 'meta' && value && typeof value === 'object') {
      const label = (value as { vaLabel?: unknown }).vaLabel
      patch = typeof label === 'string' || label === null ? { vaLabel: label } : {}
    } else return false
    // Re-check immediately before writing in case the user revoked access during a read.
    if (!await hasLocalDataConsent()) return false
    return storageSet({ ...current, ...patch, lastSyncedAt: field === 'letters' ? current.lastSyncedAt : new Date().toISOString() })
  }).catch(() => false)
  writes = next
  return next
}

async function mutateCache(mutation: CacheMutation): Promise<boolean> {
  mutation.ownerEpoch ??= currentVaCacheEpoch()
  if (typeof window === 'undefined') return applyVaCacheMutation(mutation)
  try { return (await browser.runtime.sendMessage({ type: VA_CACHE_WRITE, mutation }))?.ok === true }
  catch { return false }
}

export async function touchVaCacheSync(meta?: { vaLabel?: string | null }) {
  await mutateCache({ field: 'meta', value: meta ?? {} })
}
export function saveVaClaimsCache(claims: ParsedVaClaim[]) { return mutateCache({ field: 'claims', value: claims }) }
export function saveVaAppealsCache(appeals: ParsedVaAppeal[]) { return mutateCache({ field: 'appeals', value: appeals }) }
export function saveVaRatingsCache(ratings: VaDeviceRatingsCache, ownerEpoch?: string) { return mutateCache({ field: 'ratings', value: ratings, ownerEpoch }) }
export function saveVaProfileCache(profile: ParsedVaUserProfileForImport, ownerEpoch: string) { return mutateCache({ field: 'profile', value: profile, ownerEpoch }) }
export function saveVaLettersCache(rows: VaLetterIndexRow[], ownerEpoch: string) { return mutateCache({ field: 'letters', value: rows, ownerEpoch }) }

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
    changes: Record<string, Browser.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local') return
    const change = changes[CACHE_KEY]
    if (!change) return
    listener(parseVaDeviceCacheRecord(change.newValue))
  }

  if (!browser.storage?.onChanged?.addListener) return () => undefined
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}

export const FRESH_DEVICE_SYNC_MS = 15 * 60 * 1000

export function isRecentVaDeviceSync(lastSyncedAt: string | null | undefined, maxAgeMs = FRESH_DEVICE_SYNC_MS) {
  if (!lastSyncedAt) return false
  const parsed = Date.parse(lastSyncedAt)
  return Number.isFinite(parsed) && Date.now() - parsed >= 0 && Date.now() - parsed <= maxAgeMs
}

export function staleSyncDescription(lastSyncedAt: string | null | undefined) {
  const formatted = formatLastSynced(lastSyncedAt)
  if (formatted) {
    return `Showing data saved on this device. Last synced ${formatted}. Sign in at VA.gov to refresh.`
  }
  return 'Showing data saved on this device. Sign in at VA.gov to refresh.'
}
