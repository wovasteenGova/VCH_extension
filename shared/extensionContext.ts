export const EXTENSION_CONTEXT_INVALIDATED_MESSAGE
  = 'Extension was updated. Refresh this VA.gov tab, then use the VCH icon in your toolbar.'

export function isExtensionContextValid(): boolean {
  try {
    void browser.runtime.id
    return true
  } catch {
    return false
  }
}

export function isExtensionContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Extension context invalidated')
}

export async function safeExtensionRuntimeMessage<T = unknown>(
  message: Record<string, unknown>
): Promise<T | null> {
  if (!isExtensionContextValid()) return null

  try {
    return await browser.runtime.sendMessage(message) as T
  } catch (error) {
    if (isExtensionContextError(error)) return null
    throw error
  }
}
