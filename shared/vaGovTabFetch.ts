import type { VaFetchResponse } from './messaging'

const VA_GOV_TAB_PATTERNS = [
  'https://www.va.gov/*',
  'https://va.gov/*'
]

const VA_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'X-Key-Inflection': 'camel'
}

function parseVaResponse(status: number, text: string): VaFetchResponse {
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text.slice(0, 500) }
    }
  }

  if (status >= 200 && status < 300) {
    return { ok: true, status, data }
  }

  const record = data as { errors?: Array<{ detail?: string, title?: string }> } | null
  const detail = record?.errors?.[0]?.detail || record?.errors?.[0]?.title
  const message = typeof detail === 'string' && detail
    ? detail
    : status === 401
      ? 'Not signed in to VA.gov — open VA.gov and sign in first.'
      : status === 403
        ? 'Open Track claims on VA.gov in this browser, then refresh.'
        : `VA API returned ${status}`

  return { ok: false, status, error: message }
}

const TRACK_CLAIMS_TAB_PATTERNS = [
  'https://www.va.gov/track-claims/*',
  'https://va.gov/track-claims/*'
]

async function findVaGovTabId(preferTrackClaims = false): Promise<number | null> {
  if (preferTrackClaims) {
    const preferred = await browser.tabs.query({ url: TRACK_CLAIMS_TAB_PATTERNS })
    const preferredMatch = preferred.find(tab => typeof tab.id === 'number')
    if (preferredMatch?.id != null) return preferredMatch.id
  }

  const tabs = await browser.tabs.query({ url: VA_GOV_TAB_PATTERNS })
  const match = tabs.find(tab => typeof tab.id === 'number')
  return match?.id ?? null
}

/** Run fetch inside a signed-in VA.gov tab so session cookies attach like the website. */
export async function fetchViaVaGovTab(url: string): Promise<VaFetchResponse | null> {
  const preferTrackClaims = url.includes('benefits_claims') || url.includes('/v0/appeals')
  const tabId = await findVaGovTabId(preferTrackClaims)
  if (tabId == null) return null

  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: 'VA_API_FETCH',
      url
    })

    if (!response || typeof response !== 'object') return null

    const record = response as { ok?: boolean, status?: number, text?: string, error?: string }
    if (typeof record.status !== 'number') {
      return {
        ok: false,
        status: 0,
        error: typeof record.error === 'string' ? record.error : 'Could not reach VA.gov tab'
      }
    }

    return parseVaResponse(record.status, typeof record.text === 'string' ? record.text : '')
  } catch {
    // Content script may not be loaded yet on this tab (open before extension reload).
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (fetchUrl: string) => {
          const res = await fetch(fetchUrl, {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'X-Key-Inflection': 'camel'
            }
          })
          return {
            status: res.status,
            text: await res.text()
          }
        },
        args: [url]
      })

      const payload = results?.[0]?.result as { status?: number, text?: string } | undefined
      if (!payload || typeof payload.status !== 'number') return null
      return parseVaResponse(payload.status, payload.text ?? '')
    } catch {
      return null
    }
  }
}

export async function hasOpenVaGovTab() {
  return (await findVaGovTabId()) != null
}

export { VA_FETCH_HEADERS, parseVaResponse }
