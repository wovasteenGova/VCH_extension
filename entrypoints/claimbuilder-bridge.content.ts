import {
  isClaimBuilderBridgeOrigin,
  isClaimBuilderBridgeRequest,
  isClaimBuilderTrackCacheRequest,
  VCH_EXTENSION_BRIDGE_SOURCE,
  VCH_PROBE_VA_SESSION,
  VCH_PROBE_VA_TRACK_CACHE,
  VCH_VA_SESSION,
  VCH_VA_TRACK_CACHE,
  type VchClaimBuilderBridgeResponse,
  type VchClaimBuilderTrackCacheResponse
} from '@/shared/claimBuilderBridge'
import { type ConnectionState } from '@/shared/connectionStatus'
import { safeExtensionRuntimeMessage } from '@/shared/extensionContext'
import type { VaTrackBridgeCachePayload } from '@/shared/vaTrackBridgeCache'

const DISCONNECTED_SESSION: ConnectionState = {
  connected: false,
  label: 'Sign in to VA.gov'
}

let inflightProbe: Promise<ConnectionState> | null = null

async function probeVaSessionForBridge(): Promise<ConnectionState> {
  if (inflightProbe) return inflightProbe

  inflightProbe = (async () => {
    try {
      const session = await safeExtensionRuntimeMessage<ConnectionState>({
        type: VCH_PROBE_VA_SESSION
      })
      return session ?? DISCONNECTED_SESSION
    } catch {
      return DISCONNECTED_SESSION
    } finally {
      inflightProbe = null
    }
  })()

  return inflightProbe
}

async function readTrackCacheForClaimBuilderBridge() {
  const fromBackground = await safeExtensionRuntimeMessage<VaTrackBridgeCachePayload | { ok: false, error?: string }>({
    type: VCH_PROBE_VA_TRACK_CACHE
  })
  if (fromBackground?.ok === true) {
    return fromBackground
  }
  return { ok: false as const, error: fromBackground && 'error' in fromBackground ? fromBackground.error : 'Open the VCH extension to enable Track sync.', claims: [], appeals: [], deviceLastSyncedAt: null, vaLabel: null }
}

export default defineContentScript({
  matches: [
    'https://claimbuilder.veteranscentralhub.com/*',
    'https://claimbuilder.veteranscentralhub.us/*',
    /* Track claims UI (same app; canonical host is extension.*) */
    'https://extension.veteranscentralhub.com/*',
    'https://www.extension.veteranscentralhub.com/*',
    'https://extension.veteranscentralhub.us/*',
    'https://www.extension.veteranscentralhub.us/*'
  ],
  runAt: 'document_idle',
  main() {
    window.addEventListener('message', (event) => {
      if (window.top !== window || event.source !== window) return
      if (!isClaimBuilderBridgeOrigin(event.origin)) return

      if (isClaimBuilderTrackCacheRequest(event.data)) {
        void (async () => {
          const cache = await readTrackCacheForClaimBuilderBridge()
          const response: VchClaimBuilderTrackCacheResponse = {
            source: VCH_EXTENSION_BRIDGE_SOURCE,
            type: VCH_VA_TRACK_CACHE,
            requestId: event.data.requestId,
            ok: cache.ok,
            ...('error' in cache ? { error: cache.error } : {}),
            claims: cache.claims,
            appeals: cache.appeals,
            deviceLastSyncedAt: cache.deviceLastSyncedAt,
            vaLabel: cache.vaLabel
          }
          window.postMessage(response, event.origin)

        })()
        return
      }

      if (!isClaimBuilderBridgeRequest(event.data)) return

      const requestId = event.data.requestId

      void (async () => {
        const session = await probeVaSessionForBridge()
        const response: VchClaimBuilderBridgeResponse = {
          source: VCH_EXTENSION_BRIDGE_SOURCE,
          type: VCH_VA_SESSION,
          requestId,
          connected: session.connected,
          label: session.label
        }
        window.postMessage(response, event.origin)
      })().catch(() => {
        window.postMessage({
          source: VCH_EXTENSION_BRIDGE_SOURCE,
          type: VCH_VA_SESSION,
          requestId,
          connected: false,
          label: DISCONNECTED_SESSION.label
        } satisfies VchClaimBuilderBridgeResponse, event.origin)
      })
    })
  }
})
