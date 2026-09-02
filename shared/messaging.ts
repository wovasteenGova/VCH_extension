export type VaFetchRequest = {
  type: 'VA_FETCH'
  url: string
}

export type VaFetchResponse =
  | { ok: true, status: number, data: unknown }
  | { ok: false, status: number, error: string }

export type ExtensionMessage = VaFetchRequest | { type: 'PING' }

export function isVaFetchResponse(value: unknown): value is VaFetchResponse {
  return typeof value === 'object' && value !== null && ('ok' in value)
}
