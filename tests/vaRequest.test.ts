import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatVaVerifyAccountError,
  isAllowedVaRequest,
  isPdfBytes,
  isVaVerifyAccountError,
  MAX_VA_PDF_BYTES,
  requestVa,
  VA_REQUEST_TIMEOUT_MS
} from '../shared/vaRequest'
vi.mock('../shared/vaAccount', () => ({ registerVaAccount: vi.fn(async () => ({ accountId: 'account-1', epoch: 'epoch-1' })), verifyVaAccount: vi.fn(async () => ({ accountId: 'account-1', epoch: 'epoch-1' })), isCurrentVaEpoch: vi.fn(async () => true) }))

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('VA account verify copy', () => {
  it('tells signed-in users to refresh VA.gov first', () => {
    const message = formatVaVerifyAccountError()
    expect(message).toContain('refresh your VA.gov tab')
    expect(message).toContain('refresh here')
    expect(isVaVerifyAccountError(message)).toBe(true)
    expect(isVaVerifyAccountError('Sign in on VA.gov')).toBe(false)
  })
})

describe('read-only VA request boundary', () => {
  it.each([
    'https://evil.example/v0/user', 'http://api.va.gov/v0/user',
    'https://api.va.gov.evil.example/v0/user', 'https://me:secret@api.va.gov/v0/user',
    'https://api.va.gov/v0/user#fragment', 'https://api.va.gov:444/v0/user',
    'https://api.va.gov/v0/profile/direct_deposits', 'https://api.va.gov/v0/benefits_claims/a%2fb'
  ])('rejects unrestricted or unsafe destinations: %s', url => { expect(isAllowedVaRequest(url)).toBe(false) })

  it('allows the actual read endpoints, never write methods', () => {
    expect(isAllowedVaRequest('https://api.va.gov/v0/claim_letters?page=1')).toBe(true)
    expect(isAllowedVaRequest('https://api.va.gov/v0/benefits_claims/123')).toBe(true)
    expect(isAllowedVaRequest('https://api.va.gov/v0/user', 'POST')).toBe(false)
    expect(isAllowedVaRequest('https://api.va.gov/services/documents/v1/claim-letters/download', 'POST', true)).toBe(false)
    expect(isAllowedVaRequest('https://api.va.gov/v0/claim_letters/uuid?document_type=184', 'GET', true)).toBe(true)
    expect(isAllowedVaRequest('https://api.va.gov/v0/claim_letters/uuid?document_type=invalid', 'GET', true)).toBe(false)
  })

  it('does not call fetch for a disallowed request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await requestVa('https://evil.example/')).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the VA session, bounds the response, and validates PDF contents', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('%PDF-1.7\nexample'))
    vi.stubGlobal('fetch', fetch)
    const result = await requestVa('https://api.va.gov/v0/claim_letters/uuid?document_type=184', true)
    expect(result.ok).toBe(true)
    expect(atob(result.base64!)).toContain('%PDF-1.7')
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'error' })
    fetch.mockResolvedValue(new Response('<html>Sign in</html>'))
    expect((await requestVa('https://api.va.gov/v0/claim_letters/uuid?document_type=184', true)).ok).toBe(false)
    expect(isPdfBytes(new TextEncoder().encode('{"error":"not a PDF"}'))).toBe(false)
  })

  it('rejects an oversized PDF while streaming', async () => {
    const big = new Uint8Array(MAX_VA_PDF_BYTES + 1)
    big.set(new TextEncoder().encode('%PDF-1.7\n'), 0)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(big)))
    expect((await requestVa('https://api.va.gov/v0/claim_letters/uuid?document_type=184', true)).error).toContain('larger than the extension can download')
  })

  it('aborts a stalled request instead of leaving a pending UI forever', async () => {
    vi.useFakeTimers()
    let aborted = false
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
    })))
    const promise = requestVa('https://api.va.gov/v0/user')
    await vi.advanceTimersByTimeAsync(VA_REQUEST_TIMEOUT_MS)
    expect((await promise).error).toContain('too long')
    expect(aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
