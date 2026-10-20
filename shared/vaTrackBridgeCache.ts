import type { ParsedVaAppeal } from './vaAppealParse'
import type { ParsedVaClaim } from './vaClaimParse'
import { readVaDeviceCache } from './vaDeviceCache'

export type VaTrackBridgeCachePayload = {
  ok: true
  claims: ParsedVaClaim[]
  appeals: ParsedVaAppeal[]
  deviceLastSyncedAt: string | null
  vaLabel: string | null
}

/** Device cache read used by ClaimBuilder sync (background + content script). */
export async function readVaTrackBridgeCachePayload(): Promise<VaTrackBridgeCachePayload> {
  const cache = await readVaDeviceCache()
  return {
    ok: true,
    claims: cache.claims,
    appeals: cache.appeals,
    deviceLastSyncedAt: cache.lastSyncedAt,
    vaLabel: cache.vaLabel
  }
}
