import { readHubAccessToken } from './hubSessionRead'
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
  payload: ClaimBuilderVaImportPayload
): Promise<ClaimBuilderVaImportResult> {
  const token = await readHubAccessToken()
  if (!token) {
    throw new Error('Could not read your Hub sign-in from this browser. Open veteranscentralhub.com, sign in, then try again.')
  }

  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/api/extension/va-ratings-import`, {
    method: 'POST',
    credentials: 'include',
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
