import { readHubSession } from './hubSessionRead'
import { readVaProfileCloudApproval } from './privacyConsent'
import { importTrackSnapshotToClaimBuilder, type ClaimBuilderTrackImportResult } from './claimBuilderTrackImport'
import { readVaTrackBridgeCachePayload, type VaTrackBridgeCachePayload } from './vaTrackBridgeCache'
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

export const VA_PROFILE_SYNC_STATE_PREFIX = 'vch-va-profile-sync:'
type VaProfileSyncState = { lastSyncedAt?: string, trackFingerprint?: string }

export async function readVaProfileSyncState(accountId: string): Promise<VaProfileSyncState> {
  const key = VA_PROFILE_SYNC_STATE_PREFIX + accountId
  return (await browser.storage.local.get(key))[key] as VaProfileSyncState | undefined ?? {}
}

async function trackFingerprint(track: VaTrackBridgeCachePayload) {
  // Only changes to claims or appeals should trigger automatic uploads.
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
  const content = JSON.stringify([[...track.claims].sort(byId), [...track.appeals].sort(byId)])
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

type VaProfileSaveInput = {
  accountId: string | null
  track?: VaTrackBridgeCachePayload | null
  ratings: ClaimBuilderVaImportPayload | null
  letters: VaLetterIndexRow[]
}
type VaProfileSaveEvents = { progress?: (message: string) => void, letter?: (outcome: LetterImportOutcome) => void }

// A popup save and a background sync can both update the same VCH workspace.
function withVaProfileSaveLock<T>(save: () => Promise<T>) {
  return globalThis.navigator?.locks?.request('vch-va-profile-save', save) ?? save()
}

export function saveVaProfileToVch(input: VaProfileSaveInput, events?: VaProfileSaveEvents) {
  return withVaProfileSaveLock(() => saveApprovedVaData(input, events))
}

export async function autoSyncApprovedVaClaims() {
  const session = await readHubSession()
  if (!session.accountId || !(await readVaProfileCloudApproval(session.accountId))?.autoSyncTrack) return
  await withVaProfileSaveLock(() => saveApprovedVaData({
    accountId: session.accountId, ratings: null, letters: []
  }, undefined, true))
}

async function saveApprovedVaData(
  input: VaProfileSaveInput,
  events?: VaProfileSaveEvents,
  automatic = false
): Promise<VaProfileImportResult> {
  const session = await readHubSession()
  if (!input.accountId || session.accountId !== input.accountId) throw new Error('Your VCH destination account changed or is not signed in. Refresh the account and approve again.')
  const approval = await readVaProfileCloudApproval(input.accountId)
  const result: VaProfileImportResult = { ratingsSaved: false, lettersSaved: 0, lettersTotal: input.letters.length, letterResults: [] }
  if (automatic && !approval?.autoSyncTrack) return result
  if (!approval) throw new Error('Approve saving VA data to your VCH account first.')

  const candidate = automatic ? await readVaTrackBridgeCachePayload() : input.track
  const track = candidate && (candidate.claims.length || candidate.appeals.length) ? candidate : null
  if (!track && !input.ratings && !input.letters.length) {
    if (automatic) return result
    throw new Error('Sync claims, unlock ratings, or select decision letters to save.')
  }
  const syncState = await readVaProfileSyncState(input.accountId)
  if (track) {
    try {
      const fingerprint = await trackFingerprint(track)
      if (automatic && syncState.trackFingerprint === fingerprint) return result
      events?.progress?.('Saving claims and appeals…')
      result.track = automatic
        ? await importTrackSnapshotToClaimBuilder(track, input.accountId, { automatic: true })
        : await importTrackSnapshotToClaimBuilder(track, input.accountId)
      syncState.trackFingerprint = fingerprint
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
  if (result.track || result.ratingsSaved || result.lettersSaved > 0) {
    // A revoked or replaced approval must not receive an in-flight receipt.
    const current = await readVaProfileCloudApproval(input.accountId)
    if (current?.acceptedAt === approval.acceptedAt) {
      await browser.storage.local.set({
        [VA_PROFILE_SYNC_STATE_PREFIX + input.accountId]: { ...syncState, lastSyncedAt: new Date().toISOString() }
      }).catch(() => undefined)
    }
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
