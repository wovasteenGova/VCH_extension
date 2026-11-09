import type { VaFetchResponse } from './messaging'
import { parseVaResponse } from './vaGovTabFetch'
import { requestVa } from './vaRequest'
import { hasLocalDataConsent } from './privacyConsent'

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
