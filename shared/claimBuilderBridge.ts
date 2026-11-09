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
  accountId?: string
}

export type VchClaimBuilderTrackCacheResponse = {
  source: typeof VCH_EXTENSION_BRIDGE_SOURCE
  type: typeof VCH_VA_TRACK_CACHE
  requestId: string
  ok: boolean
  error?: string
  claims?: unknown[]
  appeals?: unknown[]
  deviceLastSyncedAt?: string | null
  vaLabel?: string | null
  /** Legacy PDF payloads accepted by older webapp versions. New imports use Letters. */
  letters?: unknown[]
}

export const CLAIMBUILDER_BRIDGE_ORIGINS = [
  'https://claimbuilder.veteranscentralhub.com', 'https://claimbuilder.veteranscentralhub.us',
  'https://extension.veteranscentralhub.com', 'https://www.extension.veteranscentralhub.com',
  'https://extension.veteranscentralhub.us', 'https://www.extension.veteranscentralhub.us'
]

export function isClaimBuilderBridgeOrigin(origin: string) {
  return CLAIMBUILDER_BRIDGE_ORIGINS.includes(origin)
}

export function isClaimBuilderBridgeRequest(data: unknown): data is VchClaimBuilderBridgeRequest {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  return record.source === VCH_CLAIMBUILDER_PAGE_SOURCE
    && record.type === VCH_PROBE_VA_SESSION
    && typeof record.requestId === 'string'
    && record.requestId.length > 0 && record.requestId.length <= 128
}

export function isClaimBuilderTrackCacheRequest(data: unknown): data is VchClaimBuilderTrackCacheRequest {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  return record.source === VCH_CLAIMBUILDER_PAGE_SOURCE
    && record.type === VCH_PROBE_VA_TRACK_CACHE
    && typeof record.requestId === 'string'
    && record.requestId.length > 0 && record.requestId.length <= 128
    && (record.accountId === undefined || (typeof record.accountId === 'string' && record.accountId.length > 0 && record.accountId.length <= 128))
}
