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
        let connected = false
        let label = ''
        try {
          const viaBackground = await browser.runtime.sendMessage({ type: 'PROBE_VA_SESSION' })
            .catch(() => null)
          if (viaBackground && typeof viaBackground === 'object') {
            const record = viaBackground as { connected?: unknown, label?: unknown }
            connected = record.connected === true
            label = typeof record.label === 'string' ? record.label : ''
          } else {
            const session = await probeVaSession()
            connected = session.connected
            label = session.label
          }
        } catch {
          connected = false
          label = ''
        }
        const response: VchClaimBuilderBridgeResponse = {
          source: VCH_EXTENSION_BRIDGE_SOURCE,
          type: VCH_VA_SESSION,
          requestId: event.data.requestId,
          connected,
          label
        }
        window.postMessage(response, event.origin)
      })()
    })
  }
})
