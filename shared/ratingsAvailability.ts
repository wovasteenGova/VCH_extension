import { fetchVaRatedDisabilities } from './vaClient'
import { readVaDeviceCache, saveVaRatingsCache } from './vaDeviceCache'
import { parseVaRatingsResponse } from './vaRatingParse'

export type RatingsAvailability =
  | { available: true, source: 'cache' | 'live' }
  | { available: false, reason: 'va_sign_in' | 'no_ratings' | 'fetch_failed', message: string }

export async function assessRatingsAvailability(): Promise<RatingsAvailability> {
  const { ratings } = await readVaDeviceCache()
  if (ratings && (ratings.rows.length || ratings.combinedRating != null)) return { available: true, source: 'cache' }

  const response = await fetchVaRatedDisabilities()
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return {
        available: false,
        reason: 'va_sign_in',
        message: 'Sign in to VA.gov before protecting or viewing disability ratings.'
      }
    }
    return { available: false, reason: 'fetch_failed', message: response.error || 'Could not reach VA.gov right now.' }
  }

  const summary = parseVaRatingsResponse(response.data)
  if (!summary.ratings.length && summary.combinedRating == null) {
    return {
      available: false,
      reason: 'no_ratings',
      message: 'No disability ratings found yet. Open your disability rating on VA.gov, then return here.'
    }
  }

  const saved = response.ownerEpoch && await saveVaRatingsCache({
    combinedRating: summary.combinedRating,
    combinedEffectiveDate: summary.combinedEffectiveDate,
    rows: summary.ratings
  }, response.ownerEpoch)
  return { available: true, source: saved ? 'cache' : 'live' }
}
