import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVaDecisionLetterIndex, REFRESH_VA_DECISION_LETTERS } from '../shared/vaClaimLetters'
import { requestVaDecisionLetterRefresh } from '../shared/vaDecisionLetterSync'
import { saveVaLettersCache } from '../shared/vaDeviceCache'
import { isCurrentVaEpoch } from '../shared/vaAccount'
import { hasLocalDataConsent } from '../shared/privacyConsent'

vi.mock('../shared/vaClaimLetters', () => ({
  fetchVaDecisionLetterIndex: vi.fn(),
  REFRESH_VA_DECISION_LETTERS: 'VCH_REFRESH_VA_DECISION_LETTERS'
}))
vi.mock('../shared/vaDeviceCache', () => ({ saveVaLettersCache: vi.fn() }))
vi.mock('../shared/vaAccount', () => ({ isCurrentVaEpoch: vi.fn() }))
vi.mock('../shared/privacyConsent', () => ({ hasLocalDataConsent: vi.fn() }))

const sendMessage = vi.fn()
const rows = [{ documentUuid: 'decision', document_type: '184' }]
const ownerEpoch = 'verified-epoch'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('browser', { runtime: { sendMessage } })
  vi.mocked(fetchVaDecisionLetterIndex).mockResolvedValue({ rows, ownerEpoch })
  vi.mocked(isCurrentVaEpoch).mockResolvedValue(true)
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

  it('refetches when the account changes during the save without returning the old list', async () => {
    sendMessage.mockResolvedValue(undefined)
    const replacement = { rows: [{ documentUuid: 'current-letter', document_type: '184' }], ownerEpoch: 'current-epoch' }
    vi.mocked(fetchVaDecisionLetterIndex).mockResolvedValueOnce({ rows, ownerEpoch }).mockResolvedValueOnce(replacement)
    vi.mocked(isCurrentVaEpoch).mockResolvedValueOnce(false)
    vi.mocked(saveVaLettersCache).mockResolvedValueOnce(false)

    await expect(requestVaDecisionLetterRefresh()).resolves.toEqual({ ok: true, ...replacement, saved: true })
    expect(saveVaLettersCache).toHaveBeenLastCalledWith(replacement.rows, replacement.ownerEpoch)
  })
})
