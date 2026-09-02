export type ExtensionMessage
  = | { type: 'GET_ACTIVE_TAB_CONTEXT' }
    | { type: 'CLIP_SELECTION'; text: string; pageUrl: string; pageTitle: string }
    | { type: 'PING' }

export type ExtensionResponse
  = | { ok: true, onVaGov: boolean, pageUrl: string, pageTitle: string, selection: string }
    | { ok: true, pong: true }
    | { ok: false, error: string }

export async function sendExtensionMessage<T extends ExtensionResponse>(
  message: ExtensionMessage
): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>
}
