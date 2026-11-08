import { parseVaAppealsList } from './vaAppealParse'
import { parseVaClaim, type ParsedVaClaim } from './vaClaimParse'
import { unwrapVaList } from './vaClient'
import {
  readVaDeviceCache,
  saveVaAppealsCache,
  saveVaClaimsCache,
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

/** Fast claims sync for the VA.gov track-claims bar: in-page fetch only, no ratings/profile. */
export async function syncClaimsFromVaPage(): Promise<VaPageClaimsSyncResult> {
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

  if (savedClaims || savedAppeals) {
    await touchVaCacheSync()
    const cache = await readVaDeviceCache()
    return {
      ok: true,
      count: cache.claims.length,
      appeals: cache.appeals.length,
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
