import {
  isClaimBuilderBridgeOrigin,
  isClaimBuilderBridgeRequest,
  VCH_EXTENSION_BRIDGE_SOURCE,
  VCH_VA_SESSION,
  type VchClaimBuilderBridgeResponse
} from '@/shared/claimBuilderBridge'
import { probeVaSession } from '@/shared/connectionStatus'

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

      void (async () => {
        const session = await probeVaSession()
        const response: VchClaimBuilderBridgeResponse = {
          source: VCH_EXTENSION_BRIDGE_SOURCE,
          type: VCH_VA_SESSION,
          requestId: event.data.requestId,
          connected: session.connected,
          label: session.label
        }
        window.postMessage(response, event.origin)
      })()
    })
  }
})
