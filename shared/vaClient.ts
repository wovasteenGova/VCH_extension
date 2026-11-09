import { isAllowedVaRequest, requestVa } from './vaRequest'
import { hasLocalDataConsent } from './privacyConsent'
import type { VaFetchResponse } from './messaging'
import { fetchViaVaGovTab, parseVaResponse } from './vaGovTabFetch'

async function vaFetchDirect(url: string): Promise<VaFetchResponse> {
  const result = await requestVa(url)
  return result.text !== undefined ? parseVaResponse(result.status, result.text, result.ownerEpoch) : { ok: false, status: result.status, error: result.error ?? 'Could not reach VA.gov.' }
}

export async function vaFetch(url: string): Promise<VaFetchResponse> {
  if (!isAllowedVaRequest(url)) {
    return { ok: false, status: 0, error: 'Only api.va.gov URLs are allowed' }
  }

  if (!await hasLocalDataConsent()) return { ok: false, status: 0, error: 'Open the VCH extension to enable VA data access.' }

  // Prefer an open VA.gov tab so session cookies attach. Direct popup fetches
  // often 403 claims/appeals even when ratings work.
  const viaTab = await fetchViaVaGovTab(url)
  // Do not repeat a timed-out or expired-session request against the same API.
  // Direct extension fetch is only a fallback when no VA tab is available.
  return viaTab ?? vaFetchDirect(url)
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

/** Always an array: VA sometimes wraps a single record or nests the list. */
export function unwrapVaList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const data = unwrapVaData(payload)
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.data)) return record.data
    if (Array.isArray(record.claims)) return record.claims
    if (Array.isArray(record.appeals)) return record.appeals
    return [data]
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.claims)) return record.claims
    if (Array.isArray(record.appeals)) return record.appeals
  }
  return []
}

export function formatVaDate(value: unknown) {
  if (typeof value !== 'string' || !value) return 'N/A'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(parsed)
}
