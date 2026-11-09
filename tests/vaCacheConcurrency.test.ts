import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyVaCacheMutation, establishVaCacheOwner, isRecentVaDeviceSync, readVaDeviceCache, VA_CACHE_OWNER_KEY, VA_DEVICE_CACHE_STORAGE_KEY } from '../shared/vaDeviceCache'
import { hasLocalDataConsent } from '../shared/privacyConsent'

vi.mock('../shared/privacyConsent', () => ({ hasLocalDataConsent: vi.fn(async () => true), revokeCloudConsent: vi.fn() }))
let stored: Record<string, unknown>
beforeEach(() => {
  stored = { [VA_CACHE_OWNER_KEY]: { accountId: 'account-a', epoch: 'epoch-a' } }
  vi.mocked(hasLocalDataConsent).mockResolvedValue(true)
  vi.stubGlobal('browser', { storage: { local: {
    get: vi.fn(async (key) => structuredClone(Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, stored[k]])))),
    remove: vi.fn(async key => { delete stored[key] }),
    set: vi.fn(async (data) => { await Promise.resolve(); Object.assign(stored, structuredClone(data)) })
  } } })
})

describe('VA cache correctness', () => {
  it('preserves parallel dataset writes through the worker queue', async () => {
    await Promise.all([
      applyVaCacheMutation({ field: 'claims', value: [{ id: 'claim-1', title: 'Claim' }], ownerEpoch: 'epoch-a' }),
      applyVaCacheMutation({ field: 'appeals', value: [{ id: 'appeal-1' }], ownerEpoch: 'epoch-a' }),
      applyVaCacheMutation({ field: 'ratings', value: { combinedRating: 70, rows: [] }, ownerEpoch: 'epoch-a' })
    ])
    const cache = await readVaDeviceCache()
    expect(cache.claims[0]!.id).toBe('claim-1')
    expect(cache.appeals[0]!.id).toBe('appeal-1')
    expect(cache.ratings!.combinedRating).toBe(70)
  })

  it('refuses cache writes after access is revoked', async () => {
    vi.mocked(hasLocalDataConsent).mockResolvedValue(false)
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'private' }] })).toBe(false)
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect((await readVaDeviceCache()).claims).toEqual([])
  })

  it('rejects malformed mutations and does not treat future cache timestamps as fresh', async () => {
    expect(await applyVaCacheMutation({ field: 'ratings', value: {} })).toBe(false)
    expect(isRecentVaDeviceSync(new Date(Date.now() + 100_000).toISOString())).toBe(false)
    expect(isRecentVaDeviceSync(new Date(Date.now() - 1_000).toISOString())).toBe(true)
  })

  it('clears another veteran’s cache and rejects late writes from that account', async () => {
    stored[VA_DEVICE_CACHE_STORAGE_KEY] = { claims: [{ id: 'old-private-claim' }] }
    const epoch = await establishVaCacheOwner('account-b')
    expect(epoch).toBeTruthy()
    expect(stored[VA_DEVICE_CACHE_STORAGE_KEY]).toBeUndefined()
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'old-private-claim' }], ownerEpoch: 'epoch-a' })).toBe(false)
    expect(await applyVaCacheMutation({ field: 'claims', value: [{ id: 'new-claim' }], ownerEpoch: epoch })).toBe(true)
    expect((await readVaDeviceCache()).claims.map(row => row.id)).toEqual(['new-claim'])
  })

  it('caches the letter index for its verified VA account without refreshing other datasets', async () => {
    const lastSyncedAt = '2026-11-01T12:00:00Z'
    stored[VA_DEVICE_CACHE_STORAGE_KEY] = { lastSyncedAt }
    const value = [{ documentUuid: 'decision', document_type: '184' }]
    expect(await applyVaCacheMutation({ field: 'letters', value, ownerEpoch: 'epoch-a' })).toBe(true)
    expect(await readVaDeviceCache()).toMatchObject({ lastSyncedAt, letters: { rows: value } })
    await establishVaCacheOwner('account-b')
    expect(await applyVaCacheMutation({ field: 'letters', value, ownerEpoch: 'epoch-a' })).toBe(false)
    expect((await readVaDeviceCache()).letters).toBeNull()
  })
})
