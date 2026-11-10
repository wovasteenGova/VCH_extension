import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVaDecisionLetterIndex, REFRESH_VA_DECISION_LETTERS } from '../shared/vaClaimLetters'
import { requestVaDecisionLetterRefresh } from '../shared/vaDecisionLetterSync'
import { checkVaCacheEpoch, saveVaLettersCache } from '../shared/vaDeviceCache'
import { hasLocalDataConsent } from '../shared/privacyConsent'

vi.mock('../shared/vaClaimLetters', () => ({
  fetchVaDecisionLetterIndex: vi.fn(),
  REFRESH_VA_DECISION_LETTERS: 'VCH_REFRESH_VA_DECISION_LETTERS'
}))
vi.mock('../shared/vaDeviceCache', () => ({ checkVaCacheEpoch: vi.fn(), saveVaLettersCache: vi.fn() }))
vi.mock('../shared/privacyConsent', () => ({ hasLocalDataConsent: vi.fn() }))

const sendMessage = vi.fn()
const rows = [{ documentUuid: 'decision', document_type: '184' }]
const ownerEpoch = 'verified-epoch'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('browser', { runtime: { sendMessage } })
  vi.mocked(fetchVaDecisionLetterIndex).mockResolvedValue({ rows, ownerEpoch })
  vi.mocked(checkVaCacheEpoch).mockResolvedValue(true)
  vi.mocked(saveVaLettersCache).mockResolvedValue(true)
  vi.mocked(hasLocalDataConsent).mockResolvedValue(true)
})

afterEach(() => vi.unstubAllGlobals())

describe('VA decision letter refresh handoff', () => {
  it('loads and saves through the popup when the background supplies no reply', async () => {
    sendMessage.mockResolvedValue(undefined)

    await expect(requestVaDecisionLetterRefresh()).resolves.toEqual({ ok: true, rows, ownerEpoch, saved: true })
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: REFRESH_VA_DECISION_LETTERS })
    expect(saveVaLettersCache).toHaveBeenCalledExactlyOnceWith(rows, ownerEpoch)
  })

  it('surfaces a real VA error after the message channel closes without writing the cache', async () => {
    sendMessage.mockRejectedValue(new Error('Message port closed'))
    vi.mocked(fetchVaDecisionLetterIndex).mockRejectedValue(new Error('Sign in to VA.gov.'))

    await expect(requestVaDecisionLetterRefresh()).resolves.toEqual({ ok: false, error: 'Sign in to VA.gov.' })
    expect(saveVaLettersCache).not.toHaveBeenCalled()
  })

  it('uses an explicit VA failure from the background without a duplicate request', async () => {
    const failure = { ok: false, error: 'Sign in to VA.gov.' }
    sendMessage.mockResolvedValue(failure)

    await expect(requestVaDecisionLetterRefresh()).resolves.toEqual(failure)
    expect(fetchVaDecisionLetterIndex).not.toHaveBeenCalled()
  })
})
