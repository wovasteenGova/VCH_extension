import { openVaSignIn as openVaSignInNavigation } from './vaSignInNavigation'
import { openHubSignIn as openHubSignInNavigation } from './hubSignInNavigation'
import { DEFAULT_HUB_ORIGIN, getDetectedHubOrigin, setDetectedHubOrigin } from './hubOrigins'
import { readHubSession } from './hubSessionRead'
import {
  fetchVaUser
} from './vaClient'

export type ConnectionState = {
  connected: boolean
  label: string
}

export function openHubHome() {
  void browser.tabs.create({ url: getDetectedHubOrigin() || DEFAULT_HUB_ORIGIN })
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

let sessionProbe: Promise<ConnectionState> | null = null
let lastProbe: { at: number, value: ConnectionState } | null = null
export async function probeVaSession(): Promise<ConnectionState> {
  if (lastProbe && Date.now() - lastProbe.at < 10_000) return lastProbe.value
  if (sessionProbe) return sessionProbe
  // One session endpoint suffices. Never chain four health-data requests just
  // to paint a sign-in chip, and share concurrent checks from the popup UI.
  sessionProbe = fetchVaUser().then(response => {
    const value = response.ok
      ? { connected: true, label: readVaProfileName(response.data) ?? 'Active' }
      : { connected: false, label: 'Sign in to VA.gov' }
    lastProbe = { at: Date.now(), value }
    return value
  }).finally(() => { sessionProbe = null })
  return sessionProbe
}

export async function probeHubSession(): Promise<ConnectionState> {
  const session = await readHubSession()
  setDetectedHubOrigin(session.hubOrigin)
  return {
    connected: session.connected,
    label: session.label
  }
}

export function openVaSignIn() {
  openVaSignInNavigation()
}

export function openHubSignIn() {
  openHubSignInNavigation()
}
