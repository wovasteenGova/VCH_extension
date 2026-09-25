export const VCH_CLAIMBUILDER_PAGE_SOURCE = 'vch-claimbuilder-page'
export const VCH_EXTENSION_BRIDGE_SOURCE = 'vch-extension-bridge'

export const VCH_PROBE_VA_SESSION = 'VCH_PROBE_VA_SESSION'
export const VCH_VA_SESSION = 'VCH_VA_SESSION'
export const VCH_PROBE_VA_TRACK_CACHE = 'VCH_PROBE_VA_TRACK_CACHE'
export const VCH_VA_TRACK_CACHE = 'VCH_VA_TRACK_CACHE'

export type VchClaimBuilderBridgeRequest = {
  source: typeof VCH_CLAIMBUILDER_PAGE_SOURCE
  type: typeof VCH_PROBE_VA_SESSION
  requestId: string
}

export type VchClaimBuilderBridgeResponse = {
  source: typeof VCH_EXTENSION_BRIDGE_SOURCE
  type: typeof VCH_VA_SESSION
  requestId: string
  connected: boolean
  label: string
}

export type VchClaimBuilderTrackCacheRequest = {
  source: typeof VCH_CLAIMBUILDER_PAGE_SOURCE
  type: typeof VCH_PROBE_VA_TRACK_CACHE
  requestId: string
}

export type VchClaimBuilderTrackCacheResponse = {
  source: typeof VCH_EXTENSION_BRIDGE_SOURCE
  type: typeof VCH_VA_TRACK_CACHE
  requestId: string
  ok: boolean
  claims?: unknown[]
  appeals?: unknown[]
  deviceLastSyncedAt?: string | null
  vaLabel?: string | null
  /** Ephemeral PDF payloads for this sync only (not stored in extension cache). */
  letters?: unknown[]
}

const CLAIMBUILDER_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*veteranscentralhub\.(com|us)$/i

export function isClaimBuilderBridgeOrigin(origin: string) {
  return CLAIMBUILDER_ORIGIN_RE.test(origin)
}

export function isClaimBuilderBridgeRequest(data: unknown): data is VchClaimBuilderBridgeRequest {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  return record.source === VCH_CLAIMBUILDER_PAGE_SOURCE
    && record.type === VCH_PROBE_VA_SESSION
    && typeof record.requestId === 'string'
    && record.requestId.length > 0
}

export function isClaimBuilderTrackCacheRequest(data: unknown): data is VchClaimBuilderTrackCacheRequest {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  return record.source === VCH_CLAIMBUILDER_PAGE_SOURCE
    && record.type === VCH_PROBE_VA_TRACK_CACHE
    && typeof record.requestId === 'string'
    && record.requestId.length > 0
}
