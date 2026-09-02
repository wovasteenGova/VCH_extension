export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.tabs.create({
        url: `${import.meta.env.VITE_VCH_HUB_URL || 'https://veteranscentralhub.us'}/benefits`
      })
    }
  })

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, pong: true })
      return
    }

    if (message?.type === 'GET_ACTIVE_TAB_CONTEXT') {
      void (async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
          if (!tab?.id) {
            sendResponse({ ok: false, error: 'No active tab' })
            return
          }
          const response = await browser.tabs.sendMessage(tab.id, { type: 'READ_PAGE_CONTEXT' })
          sendResponse(response)
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not read active tab'
          })
        }
      })()
      return true
    }

    if (message?.type === 'CLIP_SELECTION') {
      void browser.storage.local.set({
        lastClip: {
          text: message.text,
          pageUrl: message.pageUrl,
          pageTitle: message.pageTitle,
          savedAt: new Date().toISOString()
        }
      })
      sendResponse({ ok: true, pong: true })
    }
  })
})
