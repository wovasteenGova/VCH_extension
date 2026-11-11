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
export const MAX_VA_PDF_BYTES = 24 * 1024 * 1024
export const MAX_JSON_BYTES = 4 * 1024 * 1024
/** Full claim and appeal index payloads can exceed the default JSON cap. */
export const MAX_VA_LIST_JSON_BYTES = 32 * 1024 * 1024

function jsonByteLimitForUrl(url: string) {
  try {
    const { pathname } = new URL(url)
    if (pathname === '/v0/benefits_claims' || pathname === '/v0/appeals' || pathname === '/v0/claim_letters') {
      return MAX_VA_LIST_JSON_BYTES
    }
  } catch { /* ignore */ }
  return MAX_JSON_BYTES
}

function responseTooLargeMessage(url: string, binary: boolean) {
  try {
    const { pathname } = new URL(url)
    if (binary && /^\/v0\/claim_letters\//.test(pathname)) {
      return 'This decision PDF is larger than the extension can download. Open it on VA.gov or upload the PDF in ClaimBuilder.'
    }
    if (pathname === '/v0/benefits_claims') {
      return 'The VA claims list is larger than this refresh can load. Use Sync on the VCH bar at the bottom of a VA.gov Track claims page, or keep using claims saved on this device.'
    }
    if (pathname === '/v0/claim_letters') {
      return 'One page of your VA letter list is very large. Stay on Track claims on VA.gov, sync on the VCH bar, then refresh letters in the extension.'
    }
  } catch { /* ignore */ }
  return 'The VA response is too large.'
}
export type VaRawResponse = { ok: boolean, status: number, text?: string, base64?: string, contentType?: string | null, error?: string, ownerEpoch?: string }
type VaAccountStore = {
  establishOwner: (accountId: string) => Promise<string | null>
  checkEpoch: (epoch: string) => Promise<boolean>
}

export function isPdfBytes(bytes: Uint8Array) {
  return new TextDecoder('ascii').decode(bytes.subarray(0, 1024)).includes('%PDF-')
}

export const VA_VERIFY_ACCOUNT_ERROR = 'Could not verify your VA.gov account.'

export function formatVaVerifyAccountError() {
  return `${VA_VERIFY_ACCOUNT_ERROR} If you are already signed in, refresh your VA.gov tab in this browser, then refresh here. If not, sign in on VA.gov and try again.`
}

export function isVaVerifyAccountError(message: string | null | undefined) {
  return typeof message === 'string' && message.includes(VA_VERIFY_ACCOUNT_ERROR)
}

export function vaVerifyAccountHelpText() {
  return 'If you are already signed in on VA.gov, refresh your VA.gov tab, wait for the page to load, then tap refresh in the extension.'
}

export async function requestVa(url: string, binary = false, accountStore?: VaAccountStore): Promise<VaRawResponse> {
  if (!isAllowedVaRequest(url, 'GET', binary)) return { ok: false, status: 0, error: 'This VA request is not allowed.' }
  const isUser = new URL(url).pathname === '/v0/user'
  const identity = isUser ? null : await verifyVaAccount(() => requestVa('https://api.va.gov/v0/user', false, accountStore))
  if (!isUser && !identity) return { ok: false, status: 0, error: formatVaVerifyAccountError() }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VA_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { Accept: binary ? 'application/pdf,application/octet-stream' : 'application/json', 'X-Key-Inflection': 'camel' }
    })
    const limit = binary ? MAX_VA_PDF_BYTES : jsonByteLimitForUrl(url)
    const tooLargeMessage = responseTooLargeMessage(url, binary)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('VA returned an empty response.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) { await reader.cancel(); throw new Error(tooLargeMessage) }
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
        if (!registered) throw new Error(formatVaVerifyAccountError())
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
