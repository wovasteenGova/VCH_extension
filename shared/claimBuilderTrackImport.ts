import { readHubAccessToken } from './hubSessionRead'
import type { ParsedVaAppeal } from './vaAppealParse'
import type { ParsedVaClaim } from './vaClaimParse'
import type { TrackLetterUploadPayload } from './vaClaimLetters'
import { buildDecisionLetterUploadsForTrack } from './vaClaimLetters'
import { CLAIMBUILDER_URL } from './urls'
import { DEFAULT_HUB_ORIGIN } from './hubOrigins'

export type ClaimBuilderTrackImportResult = {
  ok: true
  importedAt?: string | null
  claimCount: number
  appealCount: number
  lettersIngested?: number
}

export async function importTrackSnapshotToClaimBuilder(input: {
  claims: ParsedVaClaim[]
  appeals: ParsedVaAppeal[]
  deviceLastSyncedAt: string | null
  vaLabel: string | null
  letters?: TrackLetterUploadPayload[]
  includeLetters?: boolean
}): Promise<ClaimBuilderTrackImportResult | null> {
  const token = await readHubAccessToken()
  if (!token) return null

  const letters = input.letters ?? (input.includeLetters !== false
    ? await buildDecisionLetterUploadsForTrack({
        claims: input.claims,
        appeals: input.appeals
      })
    : [])

  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/api/extension/va-track-import`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      consent: true,
      consentAt: new Date().toISOString(),
      claims: input.claims,
      appeals: input.appeals,
      deviceLastSyncedAt: input.deviceLastSyncedAt,
      vaLabel: input.vaLabel,
      ...(letters.length ? { letters } : {})
    })
  })

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`Hub sign-in expired. Open ${DEFAULT_HUB_ORIGIN.replace('https://', '')} and sign in again.`)
    }
    const message = typeof body.message === 'string'
      ? body.message
      : typeof body.statusMessage === 'string'
        ? body.statusMessage
        : `Track import failed (${response.status})`
    throw new Error(message)
  }

  const letterResult = body.letters && typeof body.letters === 'object'
    ? body.letters as Record<string, unknown>
    : null

  return {
    ok: true,
    importedAt: typeof body.importedAt === 'string' ? body.importedAt : null,
    claimCount: typeof body.claimCount === 'number' ? body.claimCount : input.claims.length,
    appealCount: typeof body.appealCount === 'number' ? body.appealCount : input.appeals.length,
    lettersIngested: typeof letterResult?.ingested === 'number' ? letterResult.ingested : letters.length
  }
}
