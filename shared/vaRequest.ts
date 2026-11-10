import { isCurrentVaEpoch, registerVaAccount, verifyVaAccount } from './vaAccount'

/** Read-only VA endpoints used by this extension; never proxy arbitrary VA actions. */
export function isAllowedVaRequest(value: unknown, method = 'GET', binary = false): value is string {
  if (typeof value !== 'string' || value.length > 2048 || method !== 'GET') return false
  try {
    const url = new URL(value)
    if (url.origin !== 'https://api.va.gov' || url.username || url.password || url.hash) return false
    const id = url.pathname.split('/').at(-1) ?? ''
    if (decodeURIComponent(id).includes('/') || decodeURIComponent(id).includes('\\')) return false
    const letter = /^\/v0\/claim_letters\/[^/]+$/.test(url.pathname)
    if (letter && (!/^\d{1,6}$/.test(url.searchParams.get('document_type') ?? '') || [...url.searchParams.keys()].some(key => key !== 'document_type'))) return false
    if (binary) return letter
    return !letter && /^(\/v0\/(user|rated_disabilities|appeals|benefits_claims|claim_letters)|\/v0\/benefits_claims\/[^/]+|\/v0\/profile\/(personal_information|service_history))$/.test(url.pathname)
  } catch { return false }
}

export const VA_REQUEST_TIMEOUT_MS = 30_000
export const MAX_VA_PDF_BYTES = 12 * 1024 * 1024
const MAX_JSON_BYTES = 4 * 1024 * 1024
export type VaRawResponse = { ok: boolean, status: number, text?: string, base64?: string, contentType?: string | null, error?: string, ownerEpoch?: string }
type VaAccountStore = {
  establishOwner: (accountId: string) => Promise<string | null>
  checkEpoch: (epoch: string) => Promise<boolean>
}

export function isPdfBytes(bytes: Uint8Array) {
  return new TextDecoder('ascii').decode(bytes.subarray(0, 1024)).includes('%PDF-')
}

export async function requestVa(url: string, binary = false, accountStore?: VaAccountStore): Promise<VaRawResponse> {
  if (!isAllowedVaRequest(url, 'GET', binary)) return { ok: false, status: 0, error: 'This VA request is not allowed.' }
  const isUser = new URL(url).pathname === '/v0/user'
  const identity = isUser ? null : await verifyVaAccount(() => requestVa('https://api.va.gov/v0/user', false, accountStore))
  if (!isUser && !identity) return { ok: false, status: 0, error: 'Could not verify your VA.gov account. Sign in on VA.gov, then try again.' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VA_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { Accept: binary ? 'application/pdf,application/octet-stream' : 'application/json', 'X-Key-Inflection': 'camel' }
    })
    const limit = binary ? MAX_VA_PDF_BYTES : MAX_JSON_BYTES
    if (Number(response.headers.get('content-length')) > limit) throw new Error('The VA response is too large.')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('VA returned an empty response.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) { await reader.cancel(); throw new Error('The VA response is too large.') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const checkEpoch = accountStore?.checkEpoch ?? isCurrentVaEpoch
    if (identity && !await checkEpoch(identity.epoch)) throw new Error('Your VA.gov account changed. Refresh before continuing.')
    if (!binary) {
      const text = new TextDecoder().decode(bytes)
      let ownerEpoch = identity?.epoch
      if (isUser && response.ok) {
        const registered = await registerVaAccount(JSON.parse(text), accountStore?.establishOwner)
        if (!registered) throw new Error('Could not verify your VA.gov account. Refresh VA.gov and try again.')
        ownerEpoch = registered.epoch
      }
      return { ok: response.ok, status: response.status, text, ownerEpoch }
    }
    if (!response.ok) return { ok: false, status: response.status, error: `VA download returned ${response.status}.` }
    if (!isPdfBytes(bytes)) throw new Error('VA did not return a PDF. Sign in on VA.gov and try again.')
    let content = ''
    for (let i = 0; i < bytes.length; i += 0x8000) content += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { ok: true, status: response.status, base64: btoa(content), contentType: response.headers.get('content-type') }
  } catch (error) {
    return { ok: false, status: 0, error: controller.signal.aborted ? 'VA.gov took too long to respond. Try again.' : error instanceof Error ? error.message : 'Could not reach VA.gov.' }
  } finally { clearTimeout(timeout); controller.abort() }
}
