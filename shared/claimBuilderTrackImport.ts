import { hasCloudConsent } from './privacyConsent'
import { readHubSession } from './hubSessionRead'
import type { VaTrackBridgeCachePayload } from './vaTrackBridgeCache'
import { CLAIMBUILDER_URL } from './urls'
import { DEFAULT_HUB_ORIGIN } from './hubOrigins'

export type ClaimBuilderTrackImportResult = {
  ok: true
  importedAt?: string | null
  claimCount: number
  appealCount: number
}

export async function importTrackSnapshotToClaimBuilder(
  input: VaTrackBridgeCachePayload,
  accountId: string
): Promise<ClaimBuilderTrackImportResult> {
  const session = await readHubSession()
  if (!session.accessToken || session.accountId !== accountId || !await hasCloudConsent('track', accountId)) {
    throw new Error('Review your VCH account and approve saving VA data in VA Profile.')
  }

  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/api/extension/va-track-import`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({
      consent: true,
      accountId,
      claims: input.claims,
      appeals: input.appeals,
      deviceLastSyncedAt: input.deviceLastSyncedAt,
      vaLabel: input.vaLabel
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

  if (body.ok !== true) throw new Error('VCH did not confirm the claim sync. Try again.')

  return {
    ok: true,
    importedAt: typeof body.importedAt === 'string' ? body.importedAt : null,
    claimCount: typeof body.claimCount === 'number' ? body.claimCount : input.claims.length,
    appealCount: typeof body.appealCount === 'number' ? body.appealCount : input.appeals.length
  }
}
