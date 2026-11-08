import { readHubSession } from './hubSessionRead'
import { grantCloudConsents, type CloudScope } from './privacyConsent'
import { importVaRatingsToClaimBuilder, type ClaimBuilderVaImportPayload } from './claimBuilderVaImport'
import { sendDecisionLetterToVch } from './decisionLetterImport'
import type { VaLetterIndexRow } from './vaClaimLetters'

export type LetterImportOutcome = { row: VaLetterIndexRow, ok: boolean, message: string }
export type VaProfileImportResult = {
  ratingsSaved: boolean
  ratingsError?: string
  lettersSaved: number
  lettersTotal: number
  letterResults: LetterImportOutcome[]
}

/** One explicit save action, one account, and one approval for the previewed data. */
export async function saveVaProfileToVch(input: {
  approved: boolean
  accountId: string | null
  ratings: ClaimBuilderVaImportPayload | null
  letters: VaLetterIndexRow[]
}, events?: { progress?: (message: string) => void, letter?: (outcome: LetterImportOutcome) => void }): Promise<VaProfileImportResult> {
  if (!input.approved) throw new Error('Approve saving the listed VA data to your VCH account first.')
  if (!input.ratings && !input.letters.length) throw new Error('Unlock ratings or select decision letters to save.')
  const session = await readHubSession()
  if (!input.accountId || session.accountId !== input.accountId) throw new Error('Your VCH destination account changed or is not signed in. Refresh the account and approve again.')
  const scopes: CloudScope[] = []
  if (input.ratings) scopes.push('ratings')
  if (input.letters.length) scopes.push('letters')
  await grantCloudConsents(scopes, input.accountId)

  const result: VaProfileImportResult = { ratingsSaved: false, lettersSaved: 0, lettersTotal: input.letters.length, letterResults: [] }
  if (input.ratings) {
    events?.progress?.('Saving ratings and VA profile…')
    try {
      await importVaRatingsToClaimBuilder(input.ratings)
      result.ratingsSaved = true
    } catch (error) {
      result.ratingsError = error instanceof Error ? error.message : 'Could not save ratings and profile.'
    }
  }
  for (const [index, row] of input.letters.entries()) {
    events?.progress?.(`Saving decision letter ${index + 1} of ${input.letters.length}…`)
    let outcome: LetterImportOutcome
    try {
      const saved = await sendDecisionLetterToVch(row)
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
  const failed = Boolean(result.ratingsError) || result.lettersSaved < result.lettersTotal
  const saved = result.ratingsSaved || result.lettersSaved > 0
  const parts: string[] = []
  if (result.ratingsSaved) parts.push('Ratings and VA profile saved.')
  if (result.ratingsError) parts.push(result.ratingsError)
  if (result.lettersTotal) parts.push(`${result.lettersSaved} of ${result.lettersTotal} decision letters saved.${result.lettersSaved < result.lettersTotal ? ' Unsent letters remain selected for retry.' : ''}`)
  return {
    title: failed ? saved ? 'Some VA data could not be saved' : 'Could not save VA data' : 'VA data saved to VCH',
    description: parts.join(' '),
    color: failed ? saved ? 'warning' as const : 'error' as const : 'success' as const
  }
}
