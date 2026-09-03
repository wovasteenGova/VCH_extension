import { parseVaAppealsList } from './vaAppealParse'
import { parseVaClaim, type ParsedVaClaim } from './vaClaimParse'
import {
  fetchVaAppeals,
  fetchVaClaimsList,
  fetchVaRatedDisabilities,
  unwrapVaList
} from './vaClient'
import {
  readVaDeviceCache,
  saveVaAppealsCache,
  saveVaClaimsCache,
  saveVaRatingsCache
} from './vaDeviceCache'
import { parseVaRatingsResponse } from './vaRatingParse'
import { refreshVaProfileForImport } from './vaUserProfileFetch'

export type VaLiveCachePersistResult = {
  claims: number
  appeals: number
  ratings: boolean
  profile: boolean
}

let inflight: Promise<VaLiveCachePersistResult> | null = null

const LIVE_CACHE_TIMEOUT_MS = 20000

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), LIVE_CACHE_TIMEOUT_MS)
    })
  ])
}

async function persistLiveVaCachesOnce(): Promise<VaLiveCachePersistResult> {
  const result: VaLiveCachePersistResult = {
    claims: 0,
    appeals: 0,
    ratings: false,
    profile: false
  }

  const [claimsRes, appealsRes, ratingsRes] = await withTimeout(
    Promise.all([
      fetchVaClaimsList(),
      fetchVaAppeals(),
      fetchVaRatedDisabilities()
    ]),
    'VA sync'
  )

  if (claimsRes.ok) {
    const parsed = unwrapVaList(claimsRes.data)
      .map(item => parseVaClaim(item))
      .filter(Boolean) as ParsedVaClaim[]
    if (parsed.length) {
      await saveVaClaimsCache(parsed)
      result.claims = (await readVaDeviceCache()).claims.length
    }
  }

  if (appealsRes.ok) {
    const parsed = parseVaAppealsList(appealsRes.data)
    if (parsed.length) {
      await saveVaAppealsCache(parsed)
      result.appeals = parsed.length
    }
  }

  if (ratingsRes.ok) {
    const summary = parseVaRatingsResponse(ratingsRes.data)
    if (summary.ratings.length || summary.combinedRating != null) {
      await saveVaRatingsCache({
        combinedRating: summary.combinedRating,
        combinedEffectiveDate: summary.combinedEffectiveDate,
        rows: summary.ratings
      })
      result.ratings = true
    }
  }

  try {
    const profile = await withTimeout(refreshVaProfileForImport(), 'VA profile sync')
    result.profile = Boolean(profile)
  } catch {
    result.profile = false
  }

  return result
}

/** Save every VA dataset that the current session can reach. Never wipes existing cache with empty. */
export function persistLiveVaCaches(): Promise<VaLiveCachePersistResult> {
  if (inflight) return inflight
  inflight = persistLiveVaCachesOnce().catch(() => ({
    claims: 0,
    appeals: 0,
    ratings: false,
    profile: false
  })).finally(() => {
    inflight = null
  })
  return inflight
}
