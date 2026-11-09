import { isAllowedVaRequest } from './vaRequest'
import { adoptVaCacheEpoch } from './vaAccount'
import { extensionTabsApi } from './extensionTabsApi'
import type { VaFetchResponse } from './messaging'

const VA_GOV_TAB_PATTERNS = [
  'https://www.va.gov/*',
  'https://va.gov/*'
]

const VA_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'X-Key-Inflection': 'camel'
}

function parseVaResponse(status: number, text: string, ownerEpoch?: string): VaFetchResponse {
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, status, error: 'VA did not return valid data. Sign in on VA.gov and try again.' }
    }
  }

  if (status >= 200 && status < 300) {
    return { ok: true, status, data, ...(ownerEpoch ? { ownerEpoch } : {}) }
  }

  const record = data as { errors?: Array<{ detail?: string, title?: string }> } | null
  const detail = record?.errors?.[0]?.detail || record?.errors?.[0]?.title
  const message = typeof detail === 'string' && detail
    ? detail
    : status === 401
      ? 'Not signed in to VA.gov: open VA.gov and sign in first.'
      : status === 403
        ? 'Open Track claims on VA.gov in this browser, then refresh.'
        : `VA API returned ${status}`

  return { ok: false, status, error: message }
}

const TRACK_CLAIMS_TAB_PATTERNS = [
  'https://www.va.gov/track-claims/*',
  'https://va.gov/track-claims/*',
  'https://www.va.gov/my-va',
  'https://va.gov/my-va',
  'https://www.va.gov/my-va/*',
  'https://va.gov/my-va/*'
]

async function findVaGovTabId(preferTrackClaims = false): Promise<number | null> {
  const tabsApi = extensionTabsApi()
  if (!tabsApi) return null

  if (preferTrackClaims) {
    const preferred = await tabsApi.query({ url: TRACK_CLAIMS_TAB_PATTERNS })
    const preferredMatch = preferred.find(tab => typeof tab.id === 'number')
    if (preferredMatch?.id != null) return preferredMatch.id
  }

  const tabs = await tabsApi.query({ url: VA_GOV_TAB_PATTERNS })
  const match = tabs.find(tab => typeof tab.id === 'number')
  return match?.id ?? null
}

/** Run fetch inside a signed-in VA.gov tab so session cookies attach like the website. */
export async function fetchViaVaGovTab(url: string): Promise<VaFetchResponse | null> {
  if (!isAllowedVaRequest(url)) return { ok: false, status: 0, error: 'This VA request is not allowed.' }
  const tabsApi = extensionTabsApi()
  if (!tabsApi) return null

  const preferTrackClaims = url.includes('benefits_claims') || url.includes('/v0/appeals')
  const tabId = await findVaGovTabId(preferTrackClaims)
  if (tabId == null) return null

  try {
    const response = await tabsApi.sendMessage(tabId, {
      type: 'VA_API_FETCH',
      url
    })

    if (!response || typeof response !== 'object') return null

    const record = response as { ok?: boolean, status?: number, text?: string, error?: string, ownerEpoch?: string }
    adoptVaCacheEpoch(record.ownerEpoch)
    if (typeof record.status !== 'number') {
      return {
        ok: false,
        status: 0,
        error: typeof record.error === 'string' ? record.error : 'Could not reach VA.gov tab'
      }
    }

    if (record.ok === false && !record.text) return { ok: false, status: record.status, error: record.error ?? 'Could not reach VA.gov.' }
    return parseVaResponse(record.status, typeof record.text === 'string' ? record.text : '', record.ownerEpoch)
  } catch {
    // Tabs opened before installation need the bundled isolated-world proxy.
    // Never execute remote code or an unrestricted fetch in the website's MAIN world.
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/va-api-proxy.js'] })
      const result = await tabsApi.sendMessage(tabId, { type: 'VA_API_FETCH', url })
      adoptVaCacheEpoch(result?.ownerEpoch)
      if (result?.text !== undefined) return parseVaResponse(result.status, result.text, result.ownerEpoch)
      return { ok: false, status: 0, error: result?.error ?? 'Refresh your VA.gov tab and try again.' }
    } catch { return { ok: false, status: 0, error: 'Refresh your VA.gov tab and try again.' } }
  }
}

export async function hasOpenVaGovTab() {
  return (await findVaGovTabId()) != null
}

async function sendVaTabMessage(tabId: number, message: Record<string, unknown>) {
  const tabsApi = extensionTabsApi()
  if (!tabsApi) return null

  try {
    const response = await tabsApi.sendMessage(tabId, message)
    if (!response || typeof response !== 'object') return null
    return response as Record<string, unknown>
  } catch {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/va-api-proxy.js'] })
      return await tabsApi.sendMessage(tabId, message) as Record<string, unknown>
    } catch { return null }
  }
}

export async function fetchBinaryViaVaGovTab(
  url: string,
  options?: { method?: string, headers?: Record<string, string>, body?: string }
): Promise<{ ok: boolean, status: number, base64: string, contentType?: string | null, error?: string } | null> {
  if (!isAllowedVaRequest(url, options?.method ?? 'GET', true)) {
    return { ok: false, status: 0, base64: '', error: 'Only api.va.gov URLs are allowed' }
  }

  const tabId = await findVaGovTabId(true)
  if (tabId == null) return null

  const record = await sendVaTabMessage(tabId, {
    type: 'VA_API_FETCH_BINARY',
    url,
    method: options?.method ?? 'GET',
    headers: options?.headers,
    body: options?.body
  })
  if (!record || typeof record.status !== 'number') return null

  const base64 = typeof record.base64 === 'string' ? record.base64 : ''
  if (record.status >= 200 && record.status < 300 && base64) {
    return {
      ok: true,
      status: record.status,
      base64,
      contentType: typeof record.contentType === 'string' ? record.contentType : null
    }
  }

  return {
    ok: false,
    status: record.status,
    base64: '',
    error: typeof record.error === 'string' ? record.error : `VA download returned ${record.status}`
  }
}

export { VA_FETCH_HEADERS, parseVaResponse }
