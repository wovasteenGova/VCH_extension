import type { VaFetchResponse } from './messaging'
import { parseVaResponse, VA_FETCH_HEADERS } from './vaGovTabFetch'

export function isVaGovPageContext() {
  if (typeof window === 'undefined') return false
  return /va\.gov$/i.test(window.location.hostname)
}

function pageReferrer() {
  if (typeof window === 'undefined') return 'https://www.va.gov/track-claims/your-claims/'
  return `${window.location.origin}${window.location.pathname}`
}

export async function fetchVaJsonInPage(
  url: string,
  options?: {
    method?: string
    body?: string
    headers?: Record<string, string>
  }
): Promise<VaFetchResponse> {
  try {
    const response = await fetch(url, {
      method: options?.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...VA_FETCH_HEADERS,
        ...(options?.headers ?? {})
      },
      body: options?.body,
      referrer: pageReferrer()
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

export async function fetchVaBinaryInPage(
  url: string,
  options?: { method?: string, headers?: Record<string, string>, body?: string }
): Promise<{ ok: boolean, status: number, base64: string, error?: string }> {
  try {
    const response = await fetch(url, {
      method: options?.method ?? 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/pdf,application/octet-stream,*/*',
        ...(options?.headers ?? {})
      },
      body: options?.body,
      referrer: pageReferrer()
    })
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const base64 = binary ? btoa(binary) : ''
    if (response.ok && base64) {
      return { ok: true, status: response.status, base64 }
    }
    return {
      ok: false,
      status: response.status,
      base64: '',
      error: `VA download returned ${response.status}`
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      base64: '',
      error: error instanceof Error ? error.message : 'Fetch failed'
    }
  }
}
