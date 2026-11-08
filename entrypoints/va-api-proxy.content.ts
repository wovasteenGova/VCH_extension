import { isExtensionContextValid } from '@/shared/extensionContext'
import { hasLocalDataConsent } from '@/shared/privacyConsent'
import { requestVa } from '@/shared/vaRequest'

export default defineContentScript({
  matches: ['https://www.va.gov/*', 'https://va.gov/*'],
  runAt: 'document_idle',
  main() {
    const scope = globalThis as typeof globalThis & { vchVaProxyReady?: boolean }
    if (!isExtensionContextValid() || scope.vchVaProxyReady) return
    scope.vchVaProxyReady = true
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || !isExtensionContextValid()) return
      if (message?.type !== 'VA_API_FETCH' && message?.type !== 'VA_API_FETCH_BINARY') return
      void (async () => {
        if (!await hasLocalDataConsent()) {
          sendResponse({ ok: false, status: 0, error: 'Open the VCH extension to review and enable VA data access.' })
          return
        }
        if (message.method && message.method !== 'GET') {
          sendResponse({ ok: false, status: 0, error: 'The extension only reads VA.gov data.' })
          return
        }
        sendResponse(await requestVa(message.url, message.type === 'VA_API_FETCH_BINARY'))
      })().catch(() => sendResponse({ ok: false, status: 0, error: 'Could not read VA.gov data.' }))
      return true
    })
  }
})
