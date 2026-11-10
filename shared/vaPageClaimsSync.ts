import { parseVaAppealsList } from './vaAppealParse'
import { parseVaClaim, type ParsedVaClaim } from './vaClaimParse'
import { fetchVaDecisionLetterIndex } from './vaClaimLetters'
import { unwrapVaList } from './vaClient'
import { VA_ENDPOINTS } from './vaEndpoints'
import { parseVaRatingsResponse } from './vaRatingParse'
import {
  requestVaCachePageSummary,
  saveVaAppealsCache,
  saveVaClaimsCache,
  saveVaLettersCache,
  saveVaRatingsCache,
  touchVaCacheSync
} from './vaDeviceCache'
import { fetchVaJsonInPage } from './vaInPageFetch'

export type VaPageClaimsSyncResult = {
  ok: boolean
  count: number
  appeals: number
  /** Kept for legacy UI callers; PDFs now require selection in Letters. */
  files: number
  error?: string
}

/** The VA.gov Sync button also warms the local ratings and letter list. */
export async function syncClaimsFromVaPage(): Promise<VaPageClaimsSyncResult> {
  const summary = await requestVaCachePageSummary()
  if (!summary?.unlocked) {
    return { ok: false, count: 0, appeals: 0, files: 0, error: 'Unlock your saved VA data in the extension before syncing.' }
  }
  void fetchVaJsonInPage(VA_ENDPOINTS.ratedDisabilities).then(result => {
    if (!result.ok || !result.ownerEpoch) return
    const ratings = parseVaRatingsResponse(result.data)
    return saveVaRatingsCache({
      combinedRating: ratings.combinedRating,
      combinedEffectiveDate: ratings.combinedEffectiveDate,
      rows: ratings.ratings
    }, result.ownerEpoch)
  }).catch(() => undefined)
  const lettersSync = fetchVaDecisionLetterIndex().then(({ rows, ownerEpoch }) => {
    if (ownerEpoch) return saveVaLettersCache(rows, ownerEpoch)
  }).catch(() => undefined)
  const [claimsRes, appealsRes] = await Promise.all([
    fetchVaJsonInPage('https://api.va.gov/v0/benefits_claims'),
    fetchVaJsonInPage('https://api.va.gov/v0/appeals')
  ])

  let savedClaims = false
  let savedAppeals = false

  if (claimsRes.ok) {
    const parsed = unwrapVaList(claimsRes.data)
      .map(item => parseVaClaim(item))
      .filter(Boolean) as ParsedVaClaim[]
    savedClaims = await saveVaClaimsCache(parsed)

  }

  if (appealsRes.ok) {
    const parsed = parseVaAppealsList(appealsRes.data)
    savedAppeals = await saveVaAppealsCache(parsed)

  }

  // Finish saving the letter list before the user leaves the VA.gov page.
  await lettersSync
  if (savedClaims || savedAppeals) {
    await touchVaCacheSync()
    const cache = await requestVaCachePageSummary()
    return {
      ok: true,
      count: cache?.count ?? 0,
      appeals: cache?.appeals ?? 0,
      files: 0
    }
  }

  const error = !claimsRes.ok && claimsRes.error
    ? claimsRes.error
    : !appealsRes.ok && appealsRes.error
      ? appealsRes.error
      : 'Could not save claims from this page. Wait for the list to finish loading, then tap Sync.'

  return {
    ok: false,
    count: 0,
    appeals: 0,
    files: 0,
    error
  }
}
