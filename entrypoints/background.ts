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
    }
  })
})
