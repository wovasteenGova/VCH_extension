import type { VaFetchResponse } from './messaging'
import { VA_ENDPOINTS } from './vaEndpoints'
import { parseVaResponse } from './vaGovTabFetch'
import { requestVa } from './vaRequest'
import { hasLocalDataConsent } from './privacyConsent'

export type VaPageSessionState = 'signed_in' | 'signed_out' | 'unknown'

/** Uses this tab's VA.gov cookies (same as the site). */
export async function probeVaSessionOnCurrentPage(): Promise<VaPageSessionState> {
  if (!await hasLocalDataConsent()) return 'unknown'
  const result = await requestVa(VA_ENDPOINTS.user)
  if (result.ok) return 'signed_in'
  if (result.status === 401 || result.status === 403) return 'signed_out'
  const detail = result.error ?? ''
  if (/sign in/i.test(detail)) return 'signed_out'
  return 'unknown'
}

export function isVaGovPageContext() {
  return typeof window !== 'undefined' && ['https://www.va.gov', 'https://va.gov'].includes(window.location.origin)
}

export async function fetchVaJsonInPage(url: string): Promise<VaFetchResponse> {
  if (!await hasLocalDataConsent()) return { ok: false, status: 0, error: 'Enable VA data access in the VCH extension first.' }
  const result = await requestVa(url)
  return result.text !== undefined ? parseVaResponse(result.status, result.text, result.ownerEpoch) : { ok: false, status: result.status, error: result.error ?? 'Could not reach VA.gov.' }
}

export async function fetchVaBinaryInPage(url: string) {
  if (!await hasLocalDataConsent()) return { ok: false, status: 0, base64: '', error: 'Enable VA data access in the VCH extension first.' }
  const result = await requestVa(url, true)
  return { ...result, base64: result.base64 ?? '' }
}
