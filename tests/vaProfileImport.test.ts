import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeVaProfileImport, saveVaProfileToVch } from '../shared/vaProfileImport'
import { readHubSession } from '../shared/hubSessionRead'
import { grantCloudConsents } from '../shared/privacyConsent'
import { importVaRatingsToClaimBuilder } from '../shared/claimBuilderVaImport'
import { sendDecisionLetterToVch } from '../shared/decisionLetterImport'

vi.mock('../shared/hubSessionRead', () => ({ readHubSession: vi.fn() }))
vi.mock('../shared/privacyConsent', () => ({ grantCloudConsents: vi.fn() }))
vi.mock('../shared/claimBuilderVaImport', () => ({ importVaRatingsToClaimBuilder: vi.fn() }))
vi.mock('../shared/decisionLetterImport', () => ({ sendDecisionLetterToVch: vi.fn() }))

const ratings = { combinedRating: 70, conditions: [{ name: 'Fixture condition', rating: 70 }] }
const letter = (id: string) => ({ documentUuid: id, document_type: '184' })
const selection = { approved: true, accountId: 'account-a', ratings, letters: [letter('one'), letter('two')] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readHubSession).mockResolvedValue({ connected: true, canImport: true, label: 'Fixture', accessToken: 'token', accountId: 'account-a', hubOrigin: 'https://www.veteranscentralhub.com' })
  vi.mocked(importVaRatingsToClaimBuilder).mockResolvedValue({ ok: true, combinedRating: 70, conditionCount: 1, appliedToConditionIds: [], appliedProfileFields: [] })
  vi.mocked(sendDecisionLetterToVch).mockResolvedValue({ documentId: 'saved-fixture', duplicate: false })
})

describe('shared VA Profile approval', () => {
  it('sends nothing until the shared approval is checked', async () => {
    await expect(saveVaProfileToVch({ ...selection, approved: false })).rejects.toThrow('Approve')
    expect(grantCloudConsents).not.toHaveBeenCalled()
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('uses one approval to save ratings and all selected letters to the same account', async () => {
    const result = await saveVaProfileToVch(selection)
    expect(grantCloudConsents).toHaveBeenCalledExactlyOnceWith(['ratings', 'letters'], 'account-a')
    expect(importVaRatingsToClaimBuilder).toHaveBeenCalledExactlyOnceWith(ratings)
    expect(sendDecisionLetterToVch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ ratingsSaved: true, lettersSaved: 2, lettersTotal: 2 })
    expect(describeVaProfileImport(result).color).toBe('success')
  })
  it('does not send ratings when they are locked or excluded from the preview', async () => {
    await saveVaProfileToVch({ ...selection, ratings: null, letters: [letter('one')] })
    expect(grantCloudConsents).toHaveBeenCalledExactlyOnceWith(['letters'], 'account-a')
    expect(importVaRatingsToClaimBuilder).not.toHaveBeenCalled()
    expect(sendDecisionLetterToVch).toHaveBeenCalledTimes(1)
  })
  it('supports saving ratings without selecting letters', async () => {
    await saveVaProfileToVch({ ...selection, letters: [] })
    expect(grantCloudConsents).toHaveBeenCalledExactlyOnceWith(['ratings'], 'account-a')
    expect(sendDecisionLetterToVch).not.toHaveBeenCalled()
  })
  it('requires a new approval if the VCH account changes', async () => {
    vi.mocked(readHubSession).mockResolvedValue({ accountId: 'account-b' } as never)
    await expect(saveVaProfileToVch(selection)).rejects.toThrow('account changed')
    expect(grantCloudConsents).not.toHaveBeenCalled()
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
