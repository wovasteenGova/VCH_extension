import { parseVaAppealsList } from './vaAppealParse'
import { parseVaClaim, type ParsedVaClaim } from './vaClaimParse'
import { unwrapVaList } from './vaClient'
import {
  readVaDeviceCache,
  saveVaAppealsCache,
  saveVaClaimsCache,
  touchVaCacheSync
} from './vaDeviceCache'
import { parseVaResponse, VA_FETCH_HEADERS } from './vaGovTabFetch'

export type VaPageClaimsSyncResult = {
  ok: boolean
  count: number
  appeals: number
  error?: string
}

const PAGE_SYNC_TIMEOUT_MS = 15000

async function fetchVaApiOnPage(url: string) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PAGE_SYNC_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: VA_FETCH_HEADERS,
      signal: controller.signal,
      referrer: 'https://www.va.gov/track-claims/your-claims/'
    })
    const text = await response.text()
    return parseVaResponse(response.status, text)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, status: 0, error: 'VA API timed out — tap Sync to try again.' }
    }

    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Network error talking to VA API'
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Fast claims sync for the VA.gov track-claims bar — in-page fetch only, no ratings/profile. */
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
    return {
      ok: true,
      count: cache.claims.length,
      appeals: cache.appeals.length
    }
  }

  const cache = await readVaDeviceCache()
  if (cache.claims.length > 0 || cache.appeals.length > 0) {
    return {
      ok: true,
      count: cache.claims.length,
      appeals: cache.appeals.length
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
    error
  }
}
