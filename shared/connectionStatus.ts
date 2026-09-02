import { VA_SIGN_IN_PAGE } from './vaEndpoints'
import { probeHubSessionFromCookies } from './hubCookieAuth'
import {
  getDetectedHubOrigin,
  hubUrlOnOrigin,
  setDetectedHubOrigin,
  VCH_HUB_ORIGINS
} from './hubOrigins'
import { hubUrl } from './urls'
import { fetchVaAppeals, fetchVaUser } from './vaClient'

export type ConnectionState = {
  connected: boolean
  label: string
}

export function openHubHome() {
  void browser.tabs.create({ url: getDetectedHubOrigin() })
}

function readVaProfileName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const data = record.data
  const attrs = (data && typeof data === 'object' && (data as Record<string, unknown>).attributes)
    ? (data as Record<string, unknown>).attributes as Record<string, unknown>
    : (record.attributes && typeof record.attributes === 'object')
        ? record.attributes as Record<string, unknown>
        : record

  const first = typeof attrs.firstName === 'string'
    ? attrs.firstName
    : typeof attrs.givenName === 'string'
      ? attrs.givenName
      : ''
  const last = typeof attrs.lastName === 'string'
    ? attrs.lastName
    : typeof attrs.familyName === 'string'
      ? attrs.familyName
      : ''
  const combined = [first, last].filter(Boolean).join(' ')
  if (combined) return combined

  if (typeof attrs.name === 'string' && attrs.name) return attrs.name
  return null
}

export async function probeVaSession(): Promise<ConnectionState> {
  const response = await fetchVaUser()
  if (response.ok) {
    const name = readVaProfileName(response.data)
    return {
      connected: true,
      label: name || 'Active'
    }
  }

  const appeals = await fetchVaAppeals()
  if (appeals.ok) {
    return {
      connected: true,
      label: 'Active'
    }
  }

  return {
    connected: false,
    label: 'Sign in to VA.gov'
  }
}

type HubSessionPayload = {
  connected?: boolean
  displayName?: string
  email?: string
}

async function probeHubSessionOnOrigin(origin: string): Promise<ConnectionState | null> {
  const sessionUrl = hubUrlOnOrigin(origin, '/api/extension/session')

  try {
    const response = await fetch(sessionUrl, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })

    if (response.status === 404) return null

    const payload = await response.json().catch(() => ({})) as HubSessionPayload
    if (response.ok && payload.connected) {
      return {
        connected: true,
        label: payload.displayName || payload.email || 'Signed in'
      }
    }
  } catch {
    /* try next origin */
  }

  return null
}

export async function probeHubSession(): Promise<ConnectionState> {
  const fromCookies = await probeHubSessionFromCookies()
  if (fromCookies) {
    if (fromCookies.hubOrigin) {
      setDetectedHubOrigin(fromCookies.hubOrigin)
    }
    return fromCookies
  }

  for (const origin of VCH_HUB_ORIGINS) {
    const fromApi = await probeHubSessionOnOrigin(origin)
    if (fromApi?.connected) {
      setDetectedHubOrigin(origin)
      return fromApi
    }
  }

  const sessionUrl = hubUrl('/api/extension/session')
  try {
    const response = await fetch(sessionUrl, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })

    if (response.status === 404) {
      return {
        connected: false,
        label: 'Hub sign-in (update Hub)'
      }
    }

    const payload = await response.json().catch(() => ({})) as HubSessionPayload
    if (response.ok && payload.connected) {
      return {
        connected: true,
        label: payload.displayName || payload.email || 'Signed in'
      }
    }
  } catch {
    /* fall through */
  }

  return {
    connected: false,
    label: 'Sign in to Hub'
  }
}

export function openVaSignIn() {
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

export function openHubSignIn() {
  void browser.tabs.create({ url: hubUrlOnOrigin(getDetectedHubOrigin(), '/auth') })
}
