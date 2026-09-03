import { probeVaSession, type ConnectionState } from './connectionStatus'
import { fetchVaRatedDisabilities } from './vaClient'
import { readVaDeviceCache, type VaDeviceRatingsCache } from './vaDeviceCache'
import { parseVaRatingsResponse } from './vaRatingParse'

export type RatingsAvailabilityReason = 'va_sign_in' | 'no_ratings' | 'fetch_failed'

export type RatingsAvailability =
  | { available: true, source: 'cache' | 'live' }
  | { available: false, reason: RatingsAvailabilityReason, message: string }

export type RatingsGateState = {
  vaSession: ConnectionState
  hasCachedRatings: boolean
  availability: RatingsAvailability
}

function hasRatingsCacheData(ratings: VaDeviceRatingsCache | null) {
  return Boolean(ratings && (ratings.rows.length > 0 || ratings.combinedRating != null))
}

export async function assessRatingsAvailability(): Promise<RatingsAvailability> {
  const cache = await readVaDeviceCache()
  if (hasRatingsCacheData(cache.ratings)) {
    return { available: true, source: 'cache' }
  }

  const response = await fetchVaRatedDisabilities()
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return {
        available: false,
        reason: 'va_sign_in',
        message: 'Sign in to VA.gov before protecting or viewing disability ratings.'
      }
    }

    return {
      available: false,
      reason: 'fetch_failed',
      message: response.error || 'Could not reach VA.gov right now.'
    }
  }

  const summary = parseVaRatingsResponse(response.data)
  const hasLive = summary.ratings.length > 0 || summary.combinedRating != null
  if (!hasLive) {
    return {
      available: false,
      reason: 'no_ratings',
      message: 'No disability ratings found yet. Open your disability rating on VA.gov, then return here.'
    }
  }

  return { available: true, source: 'live' }
}

export async function refreshRatingsGateState(): Promise<RatingsGateState> {
  const [vaSession, cache, availability] = await Promise.all([
    probeVaSession(),
    readVaDeviceCache(),
    assessRatingsAvailability()
  ])

  return {
    vaSession,
    hasCachedRatings: hasRatingsCacheData(cache.ratings),
    availability
  }
}
