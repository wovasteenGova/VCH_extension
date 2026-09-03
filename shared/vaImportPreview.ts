import type { ParsedVaRating } from './vaRatingParse'
import type { ParsedVaUserProfileForImport } from './vaUserProfileParse'
import { formatVaDate } from './vaClient'

export type VaImportPreviewItem = {
  id: string
  label: string
  detail?: string
}

export function buildVaImportPreviewItems(input: {
  combinedRating: number | null
  combinedEffectiveDate?: string
  rows: ParsedVaRating[]
  profile?: ParsedVaUserProfileForImport | null
}): VaImportPreviewItem[] {
  const items: VaImportPreviewItem[] = []

  if (input.combinedRating != null) {
    items.push({
      id: 'combined',
      label: 'Combined VA rating',
      detail: `${input.combinedRating}%${input.combinedEffectiveDate ? ` · effective ${formatVaDate(input.combinedEffectiveDate)}` : ''}`
    })
  }

  for (const row of input.rows) {
    items.push({
      id: row.id,
      label: row.name,
      detail: [
        row.rating != null ? `${row.rating}%` : null,
        row.diagnosticCode ? `DC ${row.diagnosticCode}` : null,
        row.effectiveDate ? `effective ${formatVaDate(row.effectiveDate)}` : null
      ].filter(Boolean).join(' · ') || undefined
    })
  }

  if (input.profile?.dateOfBirth) {
    items.push({
      id: 'dob',
      label: 'Date of birth (Project settings)',
      detail: input.profile.dateOfBirth
    })
  }

  if (input.profile?.phone) {
    items.push({
      id: 'phone',
      label: 'Phone (Project settings)',
      detail: input.profile.phone
    })
  }

  if (input.profile?.fullName) {
    items.push({
      id: 'name',
      label: 'Name (Project settings)',
      detail: input.profile.fullName
    })
  }

  if (input.profile?.lastFourSsn) {
    items.push({
      id: 'ssn',
      label: 'Last four SSN (Project settings)',
      detail: `•••-••-${input.profile.lastFourSsn}`
    })
  }

  for (const [index, period] of (input.profile?.servicePeriods ?? []).entries()) {
    const years = [
      period.startYear != null ? String(period.startYear) : null,
      period.endYear != null ? String(period.endYear) : null
    ].filter(Boolean).join('–')
    items.push({
      id: `service-${index}`,
      label: 'Service history (Project settings)',
      detail: [
        period.branch,
        period.rank,
        years || null
      ].filter(Boolean).join(' · ') || undefined
    })
  }

  return items
}

export function formatVaImportSuccessMessage(input: {
  appliedToConditionIds: string[]
  appliedProfileFields: string[]
  conditionCount: number
}) {
  const parts: string[] = []

  if (input.conditionCount) {
    parts.push(`${input.conditionCount} rated condition${input.conditionCount === 1 ? '' : 's'}`)
  }

  if (input.appliedToConditionIds.length) {
    parts.push(`updated current VA % on ${input.appliedToConditionIds.length} matching claim${input.appliedToConditionIds.length === 1 ? '' : 's'}`)
  }

  if (input.appliedProfileFields.length) {
    parts.push(`Project settings: ${input.appliedProfileFields.map(field => field.replace(/_/g, ' ')).join(', ')}`)
  }

  const summary = parts.length ? parts.join(' · ') : 'VA ratings saved to your account'
  return `${summary}. Opening ClaimBuilder settings to review.`
}
