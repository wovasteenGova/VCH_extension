import type { VaFetchResponse } from './messaging'
import { fetchViaVaGovTab, parseVaResponse, VA_FETCH_HEADERS } from './vaGovTabFetch'

async function vaFetchDirect(url: string): Promise<VaFetchResponse> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        ...VA_FETCH_HEADERS,
        Referer: 'https://www.va.gov/'
      }
    })

    const text = await response.text()
    return parseVaResponse(response.status, text)
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Network error talking to VA API'
    }
  }
}

async function vaFetch(url: string): Promise<VaFetchResponse> {
  if (!url.startsWith('https://api.va.gov/')) {
    return { ok: false, status: 0, error: 'Only api.va.gov URLs are allowed' }
  }

  const direct = await vaFetchDirect(url)
  if (direct.ok) return direct

  // Extension-origin fetch often gets 401/403 even when a VA.gov tab is signed in.
  // Retry from an open VA.gov tab so cookies attach the same way as the website.
  if (direct.status === 401 || direct.status === 403) {
    const viaTab = await fetchViaVaGovTab(url)
    if (viaTab?.ok) return viaTab
    if (viaTab && !viaTab.ok) return viaTab
  }

  return direct
}

export async function fetchVaClaimsList() {
  return vaFetch('https://api.va.gov/v0/benefits_claims')
}

export async function fetchVaClaimDetail(claimId: string) {
  return vaFetch(`https://api.va.gov/v0/benefits_claims/${encodeURIComponent(claimId)}`)
}

export async function fetchVaAppeals() {
  return vaFetch('https://api.va.gov/v0/appeals')
}

export async function fetchVaRatedDisabilities() {
  return vaFetch('https://api.va.gov/v0/rated_disabilities')
}

export async function fetchVaUser() {
  return vaFetch('https://api.va.gov/v0/user')
}

export async function fetchVaPersonalInformation() {
  return vaFetch('https://api.va.gov/v0/profile/personal_information')
}

export async function fetchVaServiceHistory() {
  return vaFetch('https://api.va.gov/v0/profile/service_history')
}

export function unwrapVaData<T = unknown>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.data)) return record.data as T
  if (record.data && typeof record.data === 'object') return record.data as T
  return payload as T
}

export function formatVaDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed)
}
