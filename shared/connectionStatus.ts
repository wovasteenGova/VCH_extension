import { openVaSignIn as openVaSignInNavigation } from './vaSignInNavigation'
import { DEFAULT_HUB_ORIGIN, getDetectedHubOrigin, hubUrlOnOrigin, setDetectedHubOrigin } from './hubOrigins'
import { readHubSession } from './hubSessionRead'
import {
  fetchVaAppeals,
  fetchVaClaimsList,
  fetchVaRatedDisabilities,
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

export async function probeVaSession(): Promise<ConnectionState> {
  // benefits_claims is the strictest — often needs track-claims open on VA.gov first.
  // Probe lighter endpoints first so the chip is not a false negative.
  const probes = [
    fetchVaAppeals,
    fetchVaRatedDisabilities,
    fetchVaUser,
    fetchVaClaimsList
  ]

  for (const probe of probes) {
    const response = await probe()
    if (response.ok) {
      if (probe === fetchVaUser) {
        const name = readVaProfileName(response.data)
        return { connected: true, label: name || 'Active' }
      }
      return { connected: true, label: 'Active' }
    }
  }

  return {
    connected: false,
    label: 'Sign in to VA.gov'
  }
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
  void browser.tabs.create({ url: hubUrlOnOrigin(DEFAULT_HUB_ORIGIN, '/?signin=1') })
}
