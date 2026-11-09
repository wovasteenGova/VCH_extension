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
    claims: cache.claims.map(claim => ({
      ...claim,
      trackedItems: (claim.trackedItems ?? []).flatMap(item => {
        if (!item || typeof item !== 'object') return []
        const row = item as Record<string, unknown>
        const fields = ['id', 'displayName', 'status', 'requestedDate', 'suspenseDate', 'receivedDate', 'closedDate']
        return [Object.fromEntries(fields.flatMap(key =>
          typeof row[key] === 'string' || (key === 'id' && typeof row[key] === 'number')
            ? [[key, row[key]]]
            : []
        ))]
      })
    })),
    appeals: cache.appeals,
    deviceLastSyncedAt: cache.lastSyncedAt,
    vaLabel: cache.vaLabel
  }
}
