import type { VaFetchResponse } from './messaging'

const VA_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'X-Key-Inflection': 'camel'
}

async function vaFetch(url: string): Promise<VaFetchResponse> {
  if (!url.startsWith('https://api.va.gov/')) {
    return { ok: false, status: 0, error: 'Only api.va.gov URLs are allowed' }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: VA_FETCH_HEADERS
    })

    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text.slice(0, 500) }
      }
    }

    if (!response.ok) {
      const message = typeof (data as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail === 'string'
        ? (data as { errors: Array<{ detail: string }> }).errors[0].detail
        : response.status === 401
          ? 'Not signed in to VA.gov — open VA.gov and sign in first.'
          : `VA API returned ${response.status}`
      return { ok: false, status: response.status, error: message }
    }

    return { ok: true, status: response.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Network error talking to VA API'
    }
  }
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
