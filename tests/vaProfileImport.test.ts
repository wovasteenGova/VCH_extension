import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeVaProfileImport, saveVaProfileToVch } from '../shared/vaProfileImport'
import { readHubSession } from '../shared/hubSessionRead'
import { approveVaProfileCloudSave, hasVaProfileCloudApproval } from '../shared/privacyConsent'
import { importTrackSnapshotToClaimBuilder } from '../shared/claimBuilderTrackImport'
import { importVaRatingsToClaimBuilder } from '../shared/claimBuilderVaImport'
import { sendDecisionLetterToVch } from '../shared/decisionLetterImport'

vi.mock('../shared/hubSessionRead', () => ({ readHubSession: vi.fn() }))
vi.mock('../shared/privacyConsent', () => ({ approveVaProfileCloudSave: vi.fn(), hasVaProfileCloudApproval: vi.fn() }))
vi.mock('../shared/claimBuilderTrackImport', () => ({ importTrackSnapshotToClaimBuilder: vi.fn() }))
vi.mock('../shared/claimBuilderVaImport', () => ({ importVaRatingsToClaimBuilder: vi.fn() }))
vi.mock('../shared/decisionLetterImport', () => ({ sendDecisionLetterToVch: vi.fn() }))

const ratings = { combinedRating: 70, conditions: [{ name: 'Fixture condition', rating: 70 }] }
const letter = (id: string) => ({ documentUuid: id, document_type: '184' })
const selection = { approved: true, accountId: 'account-a', ratings, letters: [letter('one'), letter('two')] }
const track = { ok: true as const, claims: [{ id: 'fixture-claim' } as never], appeals: [], deviceLastSyncedAt: null, vaLabel: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readHubSession).mockResolvedValue({ connected: true, canImport: true, label: 'Fixture', accessToken: 'token', accountId: 'account-a', hubOrigin: 'https://www.veteranscentralhub.com' })
  vi.mocked(importVaRatingsToClaimBuilder).mockResolvedValue({ ok: true, combinedRating: 70, conditionCount: 1, appliedToConditionIds: [], appliedProfileFields: [] })
  vi.mocked(sendDecisionLetterToVch).mockResolvedValue({ documentId: 'saved-fixture', duplicate: false })
  vi.mocked(importTrackSnapshotToClaimBuilder).mockResolvedValue({ ok: true, claimCount: 1, appealCount: 0 })
  vi.mocked(hasVaProfileCloudApproval).mockResolvedValue(false)
})

describe('shared VA Profile approval', () => {
  it('sends nothing until the shared approval is checked', async () => {
    await expect(saveVaProfileToVch({ ...selection, track, approved: false })).rejects.toThrow('Approve')
    expect(approveVaProfileCloudSave).not.toHaveBeenCalled()
    expect(importTrackSnapshotToClaimBuilder).not.toHaveBeenCalled()
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('uses one approval for claims, ratings, and selected letters for the same account', async () => {
    const result = await saveVaProfileToVch({ ...selection, track })
    expect(approveVaProfileCloudSave).toHaveBeenCalledExactlyOnceWith('account-a')
    expect(importTrackSnapshotToClaimBuilder).toHaveBeenCalledExactlyOnceWith(track, 'account-a')
    expect(importVaRatingsToClaimBuilder).toHaveBeenCalledExactlyOnceWith(ratings, 'account-a')
    expect(sendDecisionLetterToVch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ ratingsSaved: true, lettersSaved: 2, lettersTotal: 2 })
    expect(describeVaProfileImport(result).color).toBe('success')
  })
  it('reuses the saved approval for Track on VCH and sends only claims and appeals', async () => {
    vi.mocked(hasVaProfileCloudApproval).mockResolvedValue(true)
    const result = await saveVaProfileToVch({ approved: false, accountId: 'account-a', track, ratings: null, letters: [] })
    expect(approveVaProfileCloudSave).not.toHaveBeenCalled()
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
    expect(approveVaProfileCloudSave).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('reports partial saves accurately and returns failed letters for retry', async () => {
    vi.mocked(importVaRatingsToClaimBuilder).mockRejectedValue(new Error('Ratings service unavailable'))
    vi.mocked(sendDecisionLetterToVch).mockResolvedValueOnce({ documentId: 'saved-one', duplicate: false }).mockRejectedValueOnce(new Error('VA download failed'))
    const event = vi.fn()
    const result = await saveVaProfileToVch(selection, { letter: event })
    expect(result).toMatchObject({ ratingsSaved: false, ratingsError: 'Ratings service unavailable', lettersSaved: 1, lettersTotal: 2 })
    expect(result.letterResults.map(row => row.ok)).toEqual([true, false])
    expect(event).toHaveBeenCalledTimes(2)
    expect(describeVaProfileImport(result)).toMatchObject({ color: 'warning', title: 'Some VA data could not be saved' })
  })
})
