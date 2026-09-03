import type { ConnectionState } from './connectionStatus'
import { readHubSession } from './hubSessionRead'

export type HubCookieProbe = ConnectionState & {
  hubOrigin?: string
  canImport?: boolean
}

export async function probeHubSessionFromCookies(): Promise<HubCookieProbe | null> {
  const session = await readHubSession()
  if (!session.connected) return null

  return {
    connected: true,
    label: session.label,
    hubOrigin: session.hubOrigin,
    canImport: session.canImport
  }
}

export async function probeHubSessionState(): Promise<HubCookieProbe> {
  const session = await readHubSession()
  return {
    connected: session.connected,
    label: session.label,
    hubOrigin: session.hubOrigin,
    canImport: session.canImport
  }
}
