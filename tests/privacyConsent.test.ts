import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptLocalDataAccess, approveVaProfileCloudSave, clearVaDataAndConsent, hasCloudConsent, hasLocalDataConsent, hasVaProfileCloudApproval, PRIVACY_CONSENT_KEY, readVaProfileCloudApproval, revokeCloudConsent, revokeVaProfileCloudApproval, setVaProfileTrackAutoSync } from '../shared/privacyConsent'
import { readHubAccessToken } from '../shared/hubSessionRead'

vi.mock('../shared/hubSessionRead', () => ({ readHubAccessToken: vi.fn() }))
let stored: Record<string, unknown>
const token = (sub: string) => `head.${btoa(JSON.stringify({ sub }))}.signature`
beforeEach(() => {
  stored = {}
  vi.mocked(readHubAccessToken).mockResolvedValue(token('account-a'))
  vi.stubGlobal('browser', { storage: {
    local: {
      get: vi.fn(async (key: string | null) => key ? { [key]: stored[key] } : { ...stored }),
      set: vi.fn(async (data) => { Object.assign(stored, data) }),
      remove: vi.fn(async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key] })
    }, session: { clear: vi.fn(async () => undefined) }
  } })
})

describe('separate local and cloud permission', () => {
  it('remembers one approval per destination account across all save categories', async () => {
    await acceptLocalDataAccess()
    await approveVaProfileCloudSave('account-a')
    expect(await hasCloudConsent('ratings')).toBe(true)
    expect(await hasCloudConsent('letters')).toBe(true)
    expect(await hasCloudConsent('track', 'account-a')).toBe(true)
    expect(await hasCloudConsent('track', 'account-b')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(token('account-b'))
    expect(await hasCloudConsent('track')).toBe(false)
    await expect(approveVaProfileCloudSave('account-a')).rejects.toThrow('account changed')
    await approveVaProfileCloudSave('account-b')
    vi.mocked(readHubAccessToken).mockResolvedValue(token('account-a'))
    expect(await hasVaProfileCloudApproval('account-a')).toBe(true)
    expect((await readVaProfileCloudApproval('account-a'))?.autoSyncTrackOwnerEpoch).toBeUndefined()
    await revokeVaProfileCloudApproval('account-a')
    expect(await hasCloudConsent('track')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(token('account-b'))
    expect(await hasVaProfileCloudApproval('account-b')).toBe(true)
  })
  it('starts without consent and local consent never grants a cloud import', async () => {
    expect(await hasLocalDataConsent()).toBe(false)
    await expect(approveVaProfileCloudSave('account-a')).rejects.toThrow('Enable')
    await acceptLocalDataAccess()
    expect(await hasLocalDataConsent()).toBe(true)
    expect(await hasCloudConsent('letters')).toBe(false)
    expect(await hasCloudConsent('track')).toBe(false)
  })

  it('retains existing approval and requires a new VA account opt-in for automatic uploads', async () => {
    await acceptLocalDataAccess()
    const acceptedAt = new Date().toISOString()
    Object.assign(stored[PRIVACY_CONSENT_KEY] as object, {
      profileApprovals: { 'account-a': { acceptedAt, autoSyncTrack: true } }
    })
    expect(await readVaProfileCloudApproval('account-a')).toEqual({ acceptedAt })
    await setVaProfileTrackAutoSync('account-a', 'va-owner-epoch')
    expect(await readVaProfileCloudApproval('account-a')).toEqual({ acceptedAt, autoSyncTrackOwnerEpoch: 'va-owner-epoch' })
    await setVaProfileTrackAutoSync('account-a', null)
    expect(await readVaProfileCloudApproval('account-a')).toEqual({ acceptedAt })
  })

  it('keeps existing grants scoped to their original account and category', async () => {
    await acceptLocalDataAccess()
    Object.assign(stored[PRIVACY_CONSENT_KEY] as object, {
      cloud: { letters: { accountId: 'account-a', acceptedAt: new Date().toISOString() } }
    })
    expect(await hasCloudConsent('letters')).toBe(true)
    expect(await hasCloudConsent('ratings')).toBe(false)
    expect(await hasVaProfileCloudApproval('account-a')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(token('account-b'))
    expect(await hasCloudConsent('letters')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(null)
    expect(await hasCloudConsent('letters')).toBe(false)
  })

  it('expires old grants and rejects future timestamps', async () => {
    await acceptLocalDataAccess()
    const grant = { accountId: 'account-a', acceptedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() }
    Object.assign(stored[PRIVACY_CONSENT_KEY] as object, { cloud: { letters: grant } })
    expect(await hasCloudConsent('letters')).toBe(false)
    grant.acceptedAt = new Date(Date.now() + 86_400_000).toISOString()
    expect(await hasCloudConsent('letters')).toBe(false)
  })

  it('revokes cloud permissions without revoking local access', async () => {
    await acceptLocalDataAccess()
    await approveVaProfileCloudSave('account-a')
    await revokeCloudConsent()
    expect(await hasCloudConsent('letters')).toBe(false)
    expect(await hasVaProfileCloudApproval('account-a')).toBe(false)
    expect(await hasLocalDataConsent()).toBe(true)
  })

  it('clears all legacy VA data and keeps unrelated preferences', async () => {
    await acceptLocalDataAccess()
    Object.assign(stored, { 'vch-va-device-cache-v1': { claims: [{}] }, 'vch-va-pending-track-letters-v1': { letters: ['private-pdf'] }, 'theme': 'dark' })
    await clearVaDataAndConsent()
    expect(stored).toEqual({ theme: 'dark' })
    expect(browser.storage.session.clear).toHaveBeenCalled()
    expect(await hasLocalDataConsent()).toBe(false)
  })
})
