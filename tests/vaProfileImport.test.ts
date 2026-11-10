import { beforeEach, describe, expect, it, vi } from 'vitest'
import { autoSyncApprovedVaClaims, describeVaProfileImport, readVaProfileSyncState, saveVaProfileToVch } from '../shared/vaProfileImport'
import { readHubSession } from '../shared/hubSessionRead'
import { readVaProfileCloudApproval } from '../shared/privacyConsent'
import { readVaTrackBridgeCachePayload } from '../shared/vaTrackBridgeCache'
import { importTrackSnapshotToClaimBuilder } from '../shared/claimBuilderTrackImport'
import { importVaRatingsToClaimBuilder } from '../shared/claimBuilderVaImport'
import { sendDecisionLetterToVch } from '../shared/decisionLetterImport'
import { unlockVaVault } from '../shared/vaLocalVault'

vi.mock('../shared/hubSessionRead', () => ({ readHubSession: vi.fn() }))
vi.mock('../shared/privacyConsent', () => ({ readVaProfileCloudApproval: vi.fn() }))
vi.mock('../shared/vaTrackBridgeCache', () => ({ readVaTrackBridgeCachePayload: vi.fn() }))
vi.mock('../shared/claimBuilderTrackImport', () => ({ importTrackSnapshotToClaimBuilder: vi.fn() }))
vi.mock('../shared/claimBuilderVaImport', () => ({ importVaRatingsToClaimBuilder: vi.fn() }))
vi.mock('../shared/decisionLetterImport', () => ({ sendDecisionLetterToVch: vi.fn() }))

const ratings = { combinedRating: 70, conditions: [{ name: 'Fixture condition', rating: 70 }] }
const letter = (id: string) => ({ documentUuid: id, document_type: '184' })
const selection = { accountId: 'account-a', ratings, letters: [letter('one'), letter('two')] }
const track = { ok: true as const, claims: [{ id: 'fixture-claim' } as never], appeals: [], deviceLastSyncedAt: null, vaLabel: null }
const approval = { acceptedAt: '2026-10-01T00:00:00Z', autoSyncTrack: false }

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(readHubSession).mockResolvedValue({ connected: true, canImport: true, label: 'Fixture', accessToken: 'token', accountId: 'account-a', hubOrigin: 'https://www.veteranscentralhub.com' })
  vi.mocked(importVaRatingsToClaimBuilder).mockResolvedValue({ ok: true, combinedRating: 70, conditionCount: 1, appliedToConditionIds: [], appliedProfileFields: [] })
  vi.mocked(sendDecisionLetterToVch).mockResolvedValue({ documentId: 'saved-fixture', duplicate: false })
  vi.mocked(importTrackSnapshotToClaimBuilder).mockResolvedValue({ ok: true, claimCount: 1, appealCount: 0 })
  vi.mocked(readVaProfileCloudApproval).mockResolvedValue(approval)
  vi.mocked(readVaTrackBridgeCachePayload).mockResolvedValue(track)
  const storageArea = () => {
    const stored: Record<string, unknown> = {}
    return {
      get: async (key: string | null) => key === null ? { ...stored } : { [key]: stored[key] },
      set: async (patch: Record<string, unknown>) => { Object.assign(stored, patch) }
    }
  }
  vi.stubGlobal('browser', { storage: { local: storageArea(), session: storageArea() } })
  await unlockVaVault('synthetic-test-passphrase', async () => true)
})

describe('shared VA Profile approval', () => {
  it('sends nothing until the shared approval exists', async () => {
    vi.mocked(readVaProfileCloudApproval).mockResolvedValue(null)
    await expect(saveVaProfileToVch({ ...selection, track })).rejects.toThrow('Approve')
    expect(importTrackSnapshotToClaimBuilder).not.toHaveBeenCalled()
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('uses one approval for claims, ratings, and selected letters for the same account', async () => {
    const result = await saveVaProfileToVch({ ...selection, track })
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenCalledExactlyOnceWith(track, 'account-a')
    expect(importVaRatingsToClaimBuilder).toHaveBeenCalledExactlyOnceWith(ratings, 'account-a')
    expect(sendDecisionLetterToVch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ ratingsSaved: true, lettersSaved: 2, lettersTotal: 2 })
    expect(describeVaProfileImport(result).color).toBe('success')
    expect((await readVaProfileSyncState('account-a')).lastSyncedAt).toBeTruthy()
    expect((await readVaProfileSyncState('account-a')).importedLetterKeys).toEqual(['one:184', 'two:184'])
    expect(await readVaProfileSyncState('account-b')).toEqual({})
  })
  it('reuses the saved approval for Track on VCH and sends only claims and appeals', async () => {
    const result = await saveVaProfileToVch({ accountId: 'account-a', track, ratings: null, letters: [] })
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenCalledExactlyOnceWith(track, 'account-a')
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
    expect(result.track?.claimCount).toBe(1)
  })
  it('does not send ratings when they are locked or excluded from the preview', async () => {
    await saveVaProfileToVch({ ...selection, ratings: null, letters: [letter('one')] })
    expect(importTrackSnapshotToClaimBuilder).not.toHaveBeenCalled()
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).toHaveBeenCalledTimes(1)
  })
  it('supports saving ratings without selecting letters', async () => {
    await saveVaProfileToVch({ ...selection, letters: [] })
    expect(importVaRatingsToClaimBuilder).toHaveBeenCalledExactlyOnceWith(ratings, 'account-a')
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('requires a new approval if the VCH account changes', async () => {
    vi.mocked(readHubSession).mockResolvedValue({ accountId: 'account-b' } as never)
    await expect(saveVaProfileToVch(selection)).rejects.toThrow('account changed')
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('auto-syncs approved changes without re-sending unchanged claims or any letters', async () => {
    await autoSyncApprovedVaClaims()
    expect(importTrackSnapshotToClaimBuilder).not.toHaveBeenCalled()
    vi.mocked(readVaProfileCloudApproval).mockResolvedValue({ ...approval, autoSyncTrack: true })
    await autoSyncApprovedVaClaims()
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenCalledExactlyOnceWith(track, 'account-a', { automatic: true })
    const firstReceipt = await readVaProfileSyncState('account-a')
    vi.mocked(readVaTrackBridgeCachePayload).mockResolvedValue({ ...track, deviceLastSyncedAt: '2026-11-09T00:00:00Z' })
    await autoSyncApprovedVaClaims()
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenCalledTimes(1)
    expect(await readVaProfileSyncState('account-a')).toEqual(firstReceipt)

    const changed = { ...track, claims: [{ id: 'fixture-claim', status: 'COMPLETE' } as never] }
    vi.mocked(readVaTrackBridgeCachePayload).mockResolvedValue(changed)
    await autoSyncApprovedVaClaims()
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenLastCalledWith(changed, 'account-a', { automatic: true })
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
  })
  it('reports partial saves accurately and returns failed letters for retry', async () => {
    vi.mocked(importVaRatingsToClaimBuilder).mockRejectedValue(new Error('Ratings service unavailable'))
    vi.mocked(sendDecisionLetterToVch).mockResolvedValueOnce({ documentId: 'saved-one', duplicate: false }).mockRejectedValueOnce(new Error('VA download failed'))
    const event = vi.fn()
    const result = await saveVaProfileToVch(selection, { letter: event })
    expect(result).toMatchObject({ ratingsSaved: false, ratingsError: 'Ratings service unavailable', lettersSaved: 1, lettersTotal: 2 })
    expect(result.letterResults.map(row => row.ok)).toEqual([true, false])
    expect((await readVaProfileSyncState('account-a')).importedLetterKeys).toEqual(['one:184'])
    expect(event).toHaveBeenCalledTimes(2)
    expect(describeVaProfileImport(result)).toMatchObject({ color: 'warning', title: 'Some VA data could not be saved' })
  })
})
