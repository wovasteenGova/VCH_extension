import { isExtensionContextValid } from '@/shared/extensionContext'

const VA_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'X-Key-Inflection': 'camel'
}

export default defineContentScript({
  matches: ['https://www.va.gov/*', 'https://va.gov/*'],
  runAt: 'document_idle',
  main() {
    if (!isExtensionContextValid()) return

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtensionContextValid()) {
        sendResponse({
          ok: false,
          status: 0,
          error: 'Extension context invalidated: refresh this VA.gov tab.'
        })
        return
      }
      if (message?.type === 'VA_API_FETCH' && typeof message.url === 'string') {
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
      }

      if (message?.type === 'VA_API_FETCH_BINARY' && typeof message.url === 'string') {
        void (async () => {
          try {
            const headers = {
              ...(message.headers && typeof message.headers === 'object'
                ? message.headers as Record<string, string>
                : {}),
              Accept: 'application/pdf,application/octet-stream,*/*'
            }
            const response = await fetch(message.url, {
              method: typeof message.method === 'string' ? message.method : 'GET',
              credentials: 'include',
              headers,
              body: typeof message.body === 'string' ? message.body : undefined
            })
            const buffer = await response.arrayBuffer()
            const bytes = new Uint8Array(buffer)
            let binary = ''
            for (let i = 0; i < bytes.length; i += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            }
            sendResponse({
              ok: response.ok,
              status: response.status,
              base64: binary ? btoa(binary) : '',
              contentType: response.headers.get('content-type')
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
      }

      if (message?.type === 'VA_API_POST_JSON' && typeof message.url === 'string') {
        void (async () => {
          try {
            const response = await fetch(message.url, {
              method: 'POST',
              credentials: 'include',
              headers: {
                ...VA_FETCH_HEADERS,
                'Content-Type': 'application/json',
                ...(message.headers && typeof message.headers === 'object'
                  ? message.headers as Record<string, string>
                  : {})
              },
              body: typeof message.body === 'string' ? message.body : JSON.stringify(message.body ?? {})
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
      }
    })
  }
})
