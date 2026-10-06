import { parseVaAppealsList } from './vaAppealParse'
import { parseVaClaim, type ParsedVaClaim } from './vaClaimParse'
import { unwrapVaList } from './vaClient'
import {
  readVaDeviceCache,
  saveVaAppealsCache,
  saveVaClaimsCache,
  touchVaCacheSync
} from './vaDeviceCache'
import { buildDecisionLetterUploadsForTrack } from './vaClaimLetters'
import { fetchVaJsonInPage } from './vaInPageFetch'
import { savePendingTrackLetters } from './vaPendingLettersCache'

export type VaPageClaimsSyncResult = {
  ok: boolean
  count: number
  appeals: number
  /** Decision letter PDFs fetched from VA.gov (held for ClaimBuilder after user approves cloud sync). */
  files: number
  error?: string
}

const PAGE_SYNC_TIMEOUT_MS = 15000

async function fetchVaApiOnPage(url: string) {
  const timeout = new Promise<{ ok: false, status: 0, error: string }>((resolve) => {
    window.setTimeout(
      () => resolve({ ok: false, status: 0, error: 'VA API timed out: tap Sync to try again.' }),
      PAGE_SYNC_TIMEOUT_MS
    )
  })
  return Promise.race([fetchVaJsonInPage(url), timeout])
}

/** Fast claims sync for the VA.gov track-claims bar: in-page fetch only, no ratings/profile. */
export async function syncClaimsFromVaPage(): Promise<VaPageClaimsSyncResult> {
  const [claimsRes, appealsRes] = await Promise.all([
    fetchVaApiOnPage('https://api.va.gov/v0/benefits_claims'),
    fetchVaApiOnPage('https://api.va.gov/v0/appeals')
  ])

  let savedClaims = false
  let savedAppeals = false

  if (claimsRes.ok) {
    const parsed = unwrapVaList(claimsRes.data)
      .map(item => parseVaClaim(item))
      .filter(Boolean) as ParsedVaClaim[]
    if (parsed.length) {
      await saveVaClaimsCache(parsed)
    }
    savedClaims = true
  }

  if (appealsRes.ok) {
    const parsed = parseVaAppealsList(appealsRes.data)
    if (parsed.length) {
      await saveVaAppealsCache(parsed)
    }
    savedAppeals = true
  }

  if (savedClaims || savedAppeals) {
    await touchVaCacheSync()
    const cache = await readVaDeviceCache()
    let files = 0
    try {
      const letters = await buildDecisionLetterUploadsForTrack({
        claims: cache.claims,
        appeals: cache.appeals
      })
      files = letters.length
      if (letters.length) {
        await savePendingTrackLetters(letters)
      }
    } catch {
      files = 0
    }
    return {
      ok: true,
      count: cache.claims.length,
      appeals: cache.appeals.length,
      files
    }
  }

  const cache = await readVaDeviceCache()
  if (cache.claims.length > 0 || cache.appeals.length > 0) {
    return {
      ok: true,
      count: cache.claims.length,
      appeals: cache.appeals.length,
      files: 0
    }
  }

  const error = typeof claimsRes.error === 'string' && claimsRes.error
    ? claimsRes.error
    : typeof appealsRes.error === 'string' && appealsRes.error
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
