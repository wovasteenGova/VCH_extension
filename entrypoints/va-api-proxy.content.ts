const VA_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'X-Key-Inflection': 'camel'
}

export default defineContentScript({
  matches: ['https://www.va.gov/*', 'https://va.gov/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'VA_API_FETCH' || typeof message.url !== 'string') {
        return
      }

      void (async () => {
        try {
          const response = await fetch(message.url, {
            method: 'GET',
            credentials: 'include',
            headers: VA_FETCH_HEADERS
          })
          const text = await response.text()
          sendResponse({
            ok: response.ok,
            status: response.status,
            text
          })
        } catch (error) {
          sendResponse({
            ok: false,
            status: 0,
            error: error instanceof Error ? error.message : 'Fetch failed'
          })
        }
      })()

      return true
    })
  }
})
