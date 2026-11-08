import { beforeEach, describe, expect, it, vi } from 'vitest'
import { vaFetch } from '../shared/vaClient'
import { fetchBinaryViaVaGovTab } from '../shared/vaGovTabFetch'
import { buildDecisionLetterUploadsForTrack, isDecisionLetterRow, listVaDecisionLetters, rowFromClaimLetterEntry, downloadVaDecisionLetter } from '../shared/vaClaimLetters'
import { sendDecisionLetterToVch } from '../shared/decisionLetterImport'
import { hasCloudConsent } from '../shared/privacyConsent'

vi.mock('../shared/vaClient', () => ({ vaFetch: vi.fn() }))
vi.mock('../shared/vaGovTabFetch', () => ({ fetchBinaryViaVaGovTab: vi.fn() }))
vi.mock('../shared/hubSessionRead', () => ({ readHubAccessToken: vi.fn(async () => 'test-token') }))
vi.mock('../shared/privacyConsent', () => ({ hasCloudConsent: vi.fn(async () => false) }))

const entry = (id: string, docType: number) => ({ documentId: id, docType, receivedAt: '2026-10-22' })

beforeEach(() => { vi.clearAllMocks(); vi.mocked(hasCloudConsent).mockResolvedValue(false) })

describe('VA decision-letter discovery and import', () => {
  it('recognizes actual camelCase VA.gov letter rows without descriptive labels', () => {
    const row = rowFromClaimLetterEntry(entry('document-id', 184))!
    expect(row.documentUuid).toBe('document-id')
    expect(row.document_type).toBe('184')
    expect(isDecisionLetterRow(row)).toBe(true)
    expect(isDecisionLetterRow(rowFromClaimLetterEntry(entry('appeal-id', 27))!)).toBe(true)
    expect(isDecisionLetterRow(rowFromClaimLetterEntry(entry('evidence-request', 34))!)).toBe(false)
  })

  it('reads all reported pages, deduplicates rows, and keeps decisions only', async () => {
    vi.mocked(vaFetch).mockResolvedValueOnce({ ok: true, status: 200, data: { data: [entry('one', 184), entry('request', 34)], meta: { pagination: { totalPages: 2 } } } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { data: [entry('one', 184), entry('two', 27)], meta: { pagination: { totalPages: 2 } } } })
    expect((await listVaDecisionLetters()).map(row => row.documentUuid)).toEqual(['one', 'two'])
    expect(vaFetch).toHaveBeenNthCalledWith(2, 'https://api.va.gov/v0/claim_letters?page=2')
  })

  it('distinguishes an expired session from no letters', async () => {
    vi.mocked(vaFetch).mockResolvedValue({ ok: false, status: 401, error: 'Sign in to VA.gov' })
    await expect(listVaDecisionLetters()).rejects.toThrow('Sign in')
  })

  it('uses the same PDF endpoint and numeric document_type as VA.gov', async () => {
    vi.mocked(fetchBinaryViaVaGovTab).mockResolvedValue({ ok: true, status: 200, base64: btoa('%PDF-1.7') })
    await expect(downloadVaDecisionLetter(rowFromClaimLetterEntry(entry('{letter-id}', 27))!)).resolves.toBe(btoa('%PDF-1.7'))
    expect(fetchBinaryViaVaGovTab).toHaveBeenCalledWith('https://api.va.gov/v0/claim_letters/letter-id?document_type=27')
  })

  it('never assigns unlinked letters to the first completed claim', async () => {
    vi.mocked(vaFetch).mockResolvedValue({ ok: true, status: 200, data: [entry('one', 184)] })
    expect(await buildDecisionLetterUploadsForTrack({ claims: [{ id: 'claim', title: 'PTSD', status: 'COMPLETE' } as never], appeals: [] })).toEqual([])
    expect(fetchBinaryViaVaGovTab).not.toHaveBeenCalled()
  })

  it('does not download or send any PDF before cloud consent', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(sendDecisionLetterToVch(rowFromClaimLetterEntry(entry('one', 184))!)).rejects.toThrow('Confirm')
    expect(fetchBinaryViaVaGovTab).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends a selected PDF to the existing private library upload after consent', async () => {
    vi.mocked(hasCloudConsent).mockResolvedValue(true)
    vi.mocked(fetchBinaryViaVaGovTab).mockResolvedValue({ ok: true, status: 200, base64: btoa('%PDF-1.7') })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ document: { id: 'saved-id' }, duplicate: true })))
    vi.stubGlobal('fetch', fetch)
    expect(await sendDecisionLetterToVch(rowFromClaimLetterEntry(entry('one', 184))!)).toEqual({ documentId: 'saved-id', duplicate: true })
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBe('https://claimbuilder.veteranscentralhub.com/api/documents/upload')
    expect(options.credentials).toBe('omit')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(options.body.get('documentTypeHint')).toBe('va_decision')
    expect(options.body.get('file').type).toBe('application/pdf')
    expect(options.body.has('conditionId')).toBe(false)
  })

  it('stops if permission is revoked during download', async () => {
    vi.mocked(hasCloudConsent).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    vi.mocked(fetchBinaryViaVaGovTab).mockResolvedValue({ ok: true, status: 200, base64: btoa('%PDF-1.7') })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(sendDecisionLetterToVch(rowFromClaimLetterEntry(entry('one', 184))!)).rejects.toThrow('session changed')
    expect(fetch).not.toHaveBeenCalled()
  })
})
