import { isVaGovUrl } from '@/shared/urls'

export default defineContentScript({
  matches: ['https://www.va.gov/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'READ_PAGE_CONTEXT') return

      const selection = window.getSelection()?.toString().trim() ?? ''
      sendResponse({
        ok: true,
        onVaGov: isVaGovUrl(window.location.href),
        pageUrl: window.location.href,
        pageTitle: document.title,
        selection
      })
    })
  }
})
