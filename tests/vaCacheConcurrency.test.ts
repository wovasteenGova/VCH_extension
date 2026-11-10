import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyVaCacheMutation, establishVaCacheOwner, isRecentVaDeviceSync, readVaDeviceCache, VA_CACHE_OWNER_KEY, VA_DEVICE_CACHE_STORAGE_KEY } from '../shared/vaDeviceCache'
import { hasLocalDataConsent } from '../shared/privacyConsent'
import { lockVaVault, prepareVaSessionCache, readVaVaultRecord, readVaVaultStatus, unlockVaVault, useVaSessionCache, VA_VAULT_CONFIG_KEY, VA_VAULT_SESSION_KEY, withVaVaultLock, writeVaVaultRecord } from '../shared/vaLocalVault'

vi.mock('../shared/privacyConsent', () => ({ hasLocalDataConsent: vi.fn(async () => true), revokeCloudConsent: vi.fn() }))
let stored: Record<string, unknown>
let session: Record<string, unknown>
const passphrase = 'synthetic-test-passphrase'
const legacyClaim = { id: 'legacy-private-claim', title: 'Legacy claim' }

function storageArea(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string | string[] | null) => {
      const keys = key === null ? Object.keys(data) : Array.isArray(key) ? key : [key]
      return structuredClone(Object.fromEntries(keys.filter(name => name in data).map(name => [name, data[name]])))
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const name of Array.isArray(key) ? key : [key]) delete data[name]
    }),
    set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(data, structuredClone(value)) })
  }
}

beforeEach(() => {
  stored = {
    [VA_CACHE_OWNER_KEY]: { accountId: 'account-a', epoch: 'epoch-a' },
    [VA_DEVICE_CACHE_STORAGE_KEY]: { claims: [legacyClaim], lastSyncedAt: '2026-11-01T12:00:00Z' },
    'vch-va-letter-status:account-a': ['legacy-letter:184']
  }
  session = {}
  vi.mocked(hasLocalDataConsent).mockResolvedValue(true)
  vi.stubGlobal('browser', { storage: { local: storageArea(stored), session: storageArea(session) } })
})

describe('VA cache correctness', () => {
  it('preserves parallel dataset writes through the worker queue', async () => {
    await unlockVaVault(passphrase, hasLocalDataConsent)
    await Promise.all([
      applyVaCacheMutation({ field: 'claims', value: [{ id: 'claim-1', title: 'Claim' }], ownerEpoch: 'epoch-a' }),
      applyVaCacheMutation({ field: 'appeals', value: [{ id: 'appeal-1' }], ownerEpoch: 'epoch-a' }),
      applyVaCacheMutation({ field: 'ratings', value: { combinedRating: 70, rows: [] }, ownerEpoch: 'epoch-a' })
    ])
    const cache = await readVaDeviceCache()
    expect(cache.claims.map(claim => claim.id)).toEqual(expect.arrayContaining(['claim-1', legacyClaim.id]))
    expect(cache.appeals[0]!.id).toBe('appeal-1')
    expect(cache.ratings!.combinedRating).toBe(70)
  })

  it('refuses cache writes after access is revoked', async () => {
    await unlockVaVault(passphrase, hasLocalDataConsent)
    const before = structuredClone(stored)
    vi.mocked(hasLocalDataConsent).mockResolvedValue(false)
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'private' }] })).toBe(false)
    expect(stored).toEqual(before)
    expect((await readVaDeviceCache()).claims).toEqual([])
  })

  it('rejects malformed mutations and does not treat future cache timestamps as fresh', async () => {
    await unlockVaVault(passphrase, hasLocalDataConsent)
    expect(await applyVaCacheMutation({ field: 'ratings', value: {} })).toBe(false)
    expect(isRecentVaDeviceSync(new Date(Date.now() + 100_000).toISOString())).toBe(false)
    expect(isRecentVaDeviceSync(new Date(Date.now() - 1_000).toISOString())).toBe(true)
  })

  it('clears another veteran’s cache and rejects late writes from that account', async () => {
    await unlockVaVault(passphrase, hasLocalDataConsent)
    const epoch = await establishVaCacheOwner('account-b')
    expect(epoch).toBeTruthy()
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(stored['vch-va-letter-status:account-a']).toBeUndefined()
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'old-private-claim' }], ownerEpoch: 'epoch-a' })).toBe(false)
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'new-claim' }], ownerEpoch: epoch })).toBe(true)
    expect((await readVaDeviceCache()).claims.map(row => row.id)).toEqual(['new-claim'])
  })

  it('caches the letter index for its verified VA account without refreshing other datasets', async () => {
    const lastSyncedAt = '2026-11-01T12:00:00Z'
    await unlockVaVault(passphrase, hasLocalDataConsent)
    const value = [{ documentUuid: 'decision', document_type: '184' }]
    expect(await applyVaCacheMutation({ field: 'letters', value, ownerEpoch: 'epoch-a' })).toBe(true)
    expect(await readVaDeviceCache()).toMatchObject({ lastSyncedAt, letters: { rows: value } })
    await establishVaCacheOwner('account-b')
    expect(await applyVaCacheMutation({ field: 'letters', value, ownerEpoch: 'epoch-a' })).toBe(false)
    expect((await readVaDeviceCache()).letters).toBeNull()
  })

  it('migrates existing VA data, forgets the key when locked, and unlocks without VA access', async () => {
    expect(await readVaVaultStatus()).toBe('session')
    expect((await readVaDeviceCache()).claims).toEqual([])
    await unlockVaVault(passphrase, hasLocalDataConsent)
    const disk = JSON.stringify(stored)
    expect(disk).not.toContain(legacyClaim.id)
    expect(disk).not.toContain('legacy-letter:184')
    expect(disk).not.toContain('epoch-a')
    expect(disk).not.toContain(passphrase)
    expect(stored[VA_VAULT_SESSION_KEY]).toBeUndefined()
    expect((await readVaDeviceCache()).claims).toEqual([legacyClaim])
    expect(await readVaVaultRecord('vch-va-letter-status:account-a')).toEqual(['legacy-letter:184'])
    const oldConfig = structuredClone(stored[VA_VAULT_CONFIG_KEY])

    await lockVaVault()
    expect(session[VA_VAULT_SESSION_KEY]).toBeUndefined()
    expect(await readVaVaultStatus()).toBe('locked')
    expect((await readVaDeviceCache()).claims).toEqual([])
    expect(await establishVaCacheOwner('account-b')).toBeNull()
    await expect(unlockVaVault('incorrect-passphrase', hasLocalDataConsent)).rejects.toThrow('Check your passphrase')
    expect(stored[VA_VAULT_CONFIG_KEY]).toEqual(oldConfig)
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeDefined()
    await unlockVaVault(passphrase, hasLocalDataConsent)
    expect((await readVaDeviceCache()).claims).toEqual([legacyClaim])
  })

  it('keeps the cache in memory by default and preserves it when changing the storage setting', async () => {
    await prepareVaSessionCache()
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(stored[VA_CACHE_OWNER_KEY]).toBeUndefined()
    expect((await readVaDeviceCache()).claims).toEqual([legacyClaim])
    const letters = [{ documentUuid: 'session-letter', document_type: '184' }]
    expect(await applyVaCacheMutation({ field: 'letters', value: letters, ownerEpoch: 'epoch-a' })).toBe(true)
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(await readVaDeviceCache()).toMatchObject({ letters: { rows: letters } })

    await unlockVaVault(passphrase, hasLocalDataConsent)
    expect(session[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(JSON.stringify(stored)).not.toContain('session-letter')
    expect(await readVaDeviceCache()).toMatchObject({ letters: { rows: letters } })

    await useVaSessionCache()
    expect(await readVaVaultStatus()).toBe('session')
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(stored[VA_VAULT_CONFIG_KEY]).toBeUndefined()
    expect(session[VA_VAULT_SESSION_KEY]).toBeUndefined()
    expect(await readVaDeviceCache()).toMatchObject({ letters: { rows: letters } })
    for (const key of Object.keys(session)) delete session[key]
    expect((await readVaDeviceCache()).letters).toBeNull()
  })

  it('authenticates record names and does not overwrite unreadable ciphertext on sync', async () => {
    await unlockVaVault(passphrase, hasLocalDataConsent)
    const receipt = 'vch-va-letter-status:account-a'
    await withVaVaultLock(() => writeVaVaultRecord(receipt, ['another-letter:184']))
    stored[VA_DEVICE_CACHE_STORAGE_KEY] = stored[receipt]
    await expect(readVaVaultRecord(VA_DEVICE_CACHE_STORAGE_KEY)).rejects.toThrow()
    const before = structuredClone(stored)
    expect(await applyVaCacheMutation({ field: 'letters', value: [], ownerEpoch: 'epoch-a' })).toBe(false)
    expect(stored).toEqual(before)
  })
})
