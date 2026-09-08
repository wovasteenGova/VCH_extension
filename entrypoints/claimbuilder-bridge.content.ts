import {
  isClaimBuilderBridgeOrigin,
  isClaimBuilderBridgeRequest,
  VCH_EXTENSION_BRIDGE_SOURCE,
  VCH_PROBE_VA_SESSION,
  VCH_VA_SESSION,
  type VchClaimBuilderBridgeResponse
} from '@/shared/claimBuilderBridge'
import { type ConnectionState } from '@/shared/connectionStatus'
import { safeExtensionRuntimeMessage } from '@/shared/extensionContext'

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

export default defineContentScript({
  matches: [
    'https://claimbuilder.veteranscentralhub.com/*',
    'https://*.claimbuilder.veteranscentralhub.com/*',
    'https://claimbuilder.veteranscentralhub.us/*',
    'https://*.claimbuilder.veteranscentralhub.us/*'
  ],
  runAt: 'document_idle',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      if (!isClaimBuilderBridgeOrigin(event.origin)) return
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
