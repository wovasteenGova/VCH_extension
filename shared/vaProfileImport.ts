import { readHubSession } from './hubSessionRead'
import { approveVaProfileCloudSave, hasVaProfileCloudApproval } from './privacyConsent'
import { importTrackSnapshotToClaimBuilder, type ClaimBuilderTrackImportResult } from './claimBuilderTrackImport'
import type { VaTrackBridgeCachePayload } from './vaTrackBridgeCache'
import { importVaRatingsToClaimBuilder, type ClaimBuilderVaImportPayload } from './claimBuilderVaImport'
import { sendDecisionLetterToVch } from './decisionLetterImport'
import type { VaLetterIndexRow } from './vaClaimLetters'

export type LetterImportOutcome = { row: VaLetterIndexRow, ok: boolean, message: string }
export type VaProfileImportResult = {
  track?: ClaimBuilderTrackImportResult
  trackError?: string
  ratingsSaved: boolean
  ratingsError?: string
  lettersSaved: number
  lettersTotal: number
  letterResults: LetterImportOutcome[]
}

/** Use one account approval for future explicit saves. Only send the chosen data. */
export async function saveVaProfileToVch(input: {
  approved: boolean
  accountId: string | null
  track?: VaTrackBridgeCachePayload | null
  ratings: ClaimBuilderVaImportPayload | null
  letters: VaLetterIndexRow[]
}, events?: { progress?: (message: string) => void, letter?: (outcome: LetterImportOutcome) => void }): Promise<VaProfileImportResult> {
  const track = input.track && (input.track.claims.length || input.track.appeals.length) ? input.track : null
  if (!track && !input.ratings && !input.letters.length) throw new Error('Sync claims, unlock ratings, or select decision letters to save.')
  const session = await readHubSession()
  if (!input.accountId || session.accountId !== input.accountId) throw new Error('Your VCH destination account changed or is not signed in. Refresh the account and approve again.')
  if (input.approved) await approveVaProfileCloudSave(input.accountId)
  else if (!await hasVaProfileCloudApproval(input.accountId)) throw new Error('Approve saving VA data to your VCH account first.')

  const result: VaProfileImportResult = { ratingsSaved: false, lettersSaved: 0, lettersTotal: input.letters.length, letterResults: [] }
  if (track) {
    events?.progress?.('Saving claims and appeals…')
    try {
      result.track = await importTrackSnapshotToClaimBuilder(track, input.accountId)
    } catch (error) {
      result.trackError = error instanceof Error ? error.message : 'Could not save claims and appeals.'
    }
  }
  if (input.ratings) {
    events?.progress?.('Saving ratings and VA profile…')
    try {
      await importVaRatingsToClaimBuilder(input.ratings, input.accountId)
      result.ratingsSaved = true
    } catch (error) {
      result.ratingsError = error instanceof Error ? error.message : 'Could not save ratings and profile.'
    }
  }
  for (const [index, row] of input.letters.entries()) {
    events?.progress?.(`Saving decision letter ${index + 1} of ${input.letters.length}…`)
    let outcome: LetterImportOutcome
    try {
      const saved = await sendDecisionLetterToVch(row, input.accountId)
      outcome = { row, ok: true, message: saved.duplicate ? 'Already in your VCH library' : 'Saved to your VCH library' }
      result.lettersSaved++
    } catch (error) {
      outcome = { row, ok: false, message: error instanceof Error ? error.message : 'Could not save this letter. Try again.' }
    }
    result.letterResults.push(outcome)
    events?.letter?.(outcome)
  }
  return result
}

export function describeVaProfileImport(result: VaProfileImportResult) {
  const failed = Boolean(result.trackError || result.ratingsError) || result.lettersSaved < result.lettersTotal
  const saved = Boolean(result.track) || result.ratingsSaved || result.lettersSaved > 0
  const parts: string[] = []
  if (result.track) {
    const { claimCount, appealCount } = result.track
    parts.push(`${claimCount} claim${claimCount === 1 ? '' : 's'} and ${appealCount} appeal${appealCount === 1 ? '' : 's'} synced to VCH.`)
  }
  if (result.trackError) parts.push(result.trackError)
  if (result.ratingsSaved) parts.push('Ratings and VA profile saved.')
  if (result.ratingsError) parts.push(result.ratingsError)
  if (result.lettersTotal) parts.push(`${result.lettersSaved} of ${result.lettersTotal} decision letters saved.${result.lettersSaved < result.lettersTotal ? ' Unsent letters remain selected for retry.' : ''}`)
  return {
    title: failed ? saved ? 'Some VA data could not be saved' : 'Could not save VA data' : 'VA data saved to VCH',
    description: parts.join(' '),
    color: failed ? saved ? 'warning' as const : 'error' as const : 'success' as const
  }
}
