import {
  VCH_PROBE_VA_SESSION
} from '@/shared/claimBuilderBridge'
import { probeVaSession } from '@/shared/connectionStatus'
import { hubUrl, VCH_EXTENSION_HUB_PATH } from '@/shared/urls'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.tabs.create({ url: hubUrl(VCH_EXTENSION_HUB_PATH) })
    }
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true })
      return
    }

    if (message?.type === VCH_PROBE_VA_SESSION) {
      void (async () => {
        try {
          sendResponse(await probeVaSession())
        } catch {
          sendResponse({ connected: false, label: 'Sign in to VA.gov' })
        }
      })()
      return true
    }

    if (message?.type === 'OPEN_EXTENSION_POPUP') {
      void (async () => {
        try {
          if (browser.action?.openPopup) {
            await browser.action.openPopup()
            sendResponse({ ok: true })
            return
          }
        } catch {
          /* fall through: openPopup needs a recent user gesture in some builds */
        }
        sendResponse({
          ok: false,
          hint: 'Click the VCH Web Extension icon in your browser toolbar.'
        })
      })()
      return true
    }
  })
})
