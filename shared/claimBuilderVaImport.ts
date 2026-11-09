import { hasCloudConsent } from './privacyConsent'
import { readHubAccessToken, readHubSession } from './hubSessionRead'
import type { ParsedVaRating } from './vaRatingParse'
import type { ParsedVaUserProfileForImport } from './vaUserProfileParse'
import { CLAIMBUILDER_URL } from './urls'
import { DEFAULT_HUB_ORIGIN } from './hubOrigins'

export type ClaimBuilderVaImportPayload = {
  combinedRating: number | null
  combinedEffectiveDate?: string
  conditions: Array<{
    name: string
    rating: number | null
    diagnosticCode?: string
    effectiveDate?: string
  }>
  profile?: ParsedVaUserProfileForImport
}

export type ClaimBuilderVaImportResult = {
  ok: true
  combinedRating: number | null
  appliedToConditionIds: string[]
  appliedProfileFields: string[]
  importedAt?: string
  conditionCount: number
}

export type ClaimBuilderVaImportSyncStatus = {
  synced: boolean
  importedAt: string | null
  /** False when the server could not be reached: do not treat as out of sync. */
  checked: boolean
}

export function buildClaimBuilderVaImportPayload(input: {
  combinedRating: number | null
  combinedEffectiveDate?: string
  rows: ParsedVaRating[]
  profile?: ParsedVaUserProfileForImport | null
}): ClaimBuilderVaImportPayload {
  return {
    combinedRating: input.combinedRating,
    combinedEffectiveDate: input.combinedEffectiveDate,
    conditions: input.rows.map(row => ({
      name: row.name,
      rating: row.rating,
      diagnosticCode: row.diagnosticCode,
      effectiveDate: row.effectiveDate
    })),
    ...(input.profile ? { profile: input.profile } : {})
  }
}

export async function importVaRatingsToClaimBuilder(
  payload: ClaimBuilderVaImportPayload,
  accountId: string
): Promise<ClaimBuilderVaImportResult> {
  const { accessToken: token, accountId: currentAccountId } = await readHubSession()
  if (!token || currentAccountId !== accountId || !await hasCloudConsent('ratings', accountId)) {
    throw new Error('Review your VCH account and approve saving VA data in VA Profile.')
  }

  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/api/extension/va-ratings-import`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`Hub sign-in expired. Open ${DEFAULT_HUB_ORIGIN.replace('https://', '')} and sign in again.`)
    }

    if (response.status === 404) {
      throw new Error('ClaimBuilder sync is not live on the server yet. Deploy the latest ClaimBuilder build, then try again.')
    }

    const message = typeof body.message === 'string'
      ? body.message
      : typeof body.statusMessage === 'string'
        ? body.statusMessage
        : `ClaimBuilder import failed (${response.status})`
    throw new Error(message)
  }

  return {
    ok: true,
    combinedRating: typeof body.combinedRating === 'number' ? body.combinedRating : payload.combinedRating,
    appliedToConditionIds: Array.isArray(body.appliedToConditionIds)
      ? body.appliedToConditionIds.filter(id => typeof id === 'string')
      : [],
    appliedProfileFields: Array.isArray(body.appliedProfileFields)
      ? body.appliedProfileFields.filter(field => typeof field === 'string')
      : [],
    importedAt: typeof body.importedAt === 'string' ? body.importedAt : undefined,
    conditionCount: typeof body.conditionCount === 'number' ? body.conditionCount : payload.conditions.length
  }
}

export async function checkClaimBuilderVaImportSync(
  payload: ClaimBuilderVaImportPayload
): Promise<ClaimBuilderVaImportSyncStatus> {
  if (!await hasCloudConsent('ratings')) return { synced: false, importedAt: null, checked: false }
  const token = await readHubAccessToken()
  if (!token) {
    return { synced: false, importedAt: null, checked: false }
  }

  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/api/extension/va-ratings-import/status`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    return { synced: false, importedAt: null, checked: false }
  }

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  return {
    synced: body.synced === true,
    importedAt: typeof body.importedAt === 'string' ? body.importedAt : null,
    checked: true
  }
}
