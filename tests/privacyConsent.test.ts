import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptLocalDataAccess, clearVaDataAndConsent, grantCloudConsent, hasCloudConsent, hasLocalDataConsent, PRIVACY_CONSENT_KEY, revokeCloudConsent } from '../shared/privacyConsent'
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
  it('starts without consent and local consent never grants a cloud import', async () => {
    expect(await hasLocalDataConsent()).toBe(false)
    await expect(grantCloudConsent('letters')).rejects.toThrow('Enable')
    await acceptLocalDataAccess()
    expect(await hasLocalDataConsent()).toBe(true)
    expect(await hasCloudConsent('letters')).toBe(false)
    expect(await hasCloudConsent('track')).toBe(false)
  })

  it('scopes a grant to its destination account and data category', async () => {
    await acceptLocalDataAccess()
    await grantCloudConsent('letters')
    expect(await hasCloudConsent('letters')).toBe(true)
    expect(await hasCloudConsent('ratings')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(token('account-b'))
    expect(await hasCloudConsent('letters')).toBe(false)
    vi.mocked(readHubAccessToken).mockResolvedValue(null)
    expect(await hasCloudConsent('letters')).toBe(false)
  })

  it('expires old grants and rejects future timestamps', async () => {
    await acceptLocalDataAccess()
    await grantCloudConsent('letters')
    const data = stored[PRIVACY_CONSENT_KEY] as any
    data.cloud.letters.acceptedAt = new Date(Date.now() - 31 * 86_400_000).toISOString()
    expect(await hasCloudConsent('letters')).toBe(false)
    data.cloud.letters.acceptedAt = new Date(Date.now() + 86_400_000).toISOString()
    expect(await hasCloudConsent('letters')).toBe(false)
  })

  it('revokes cloud permissions without revoking local access', async () => {
    await acceptLocalDataAccess()
    await grantCloudConsent('letters')
    await revokeCloudConsent()
    expect(await hasCloudConsent('letters')).toBe(false)
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
