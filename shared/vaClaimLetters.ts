import type { ParsedVaAppeal } from './vaAppealParse'
import type { ParsedVaClaim } from './vaClaimParse'
import { vaFetch } from './vaClient'
import {
  claimantIdentifierRequestData,
  fetchVaClaimantIdentifier,
  type VaClaimantIdentifier
} from './vaClaimantIdentifier'
import { fetchBinaryViaVaGovTab, postJsonViaVaGovTab } from './vaGovTabFetch'

export type TrackLetterUploadPayload = {
  entityKind: 'claim' | 'appeal'
  entityId: string
  filename: string
  contentBase64: string
  letterDate?: string | null
  entityTitle?: string | null
}

const MAX_LETTERS_PER_SYNC = 10
const MAX_LETTER_BYTES = 12 * 1024 * 1024

type VaLetterIndexRow = {
  documentUuid?: string
  documentId?: string
  id?: string
  claimId?: string
  benefitsClaimId?: string
  appealId?: string
  receivedAt?: string
  documentDate?: string
  letterDate?: string
  uploadedDateTime?: string
  documentType?: string
  documentTypeLabel?: string
  typeDescription?: string
  subject?: string
  downloadUrl?: string
}

function readString(value: unknown, max = 200) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function normalizeUuid(value: unknown) {
  const raw = readString(value, 80)
  if (!raw) return undefined
  return raw.replace(/[{}]/g, '')
}

function normalizeLetterRow(row: VaLetterIndexRow): VaLetterIndexRow {
  const documentUuid = normalizeUuid(row.documentUuid)
    ?? normalizeUuid(row.documentId)
    ?? normalizeUuid(row.id)
  return {
    ...row,
    documentUuid,
    documentId: documentUuid,
    letterDate: row.letterDate
      ?? row.documentDate
      ?? row.receivedAt
      ?? readString(row.uploadedDateTime, 40),
    documentTypeLabel: row.documentTypeLabel
      ?? row.typeDescription
      ?? readString(row.subject, 200)
  }
}

export function unwrapLetterRows(payload: unknown): VaLetterIndexRow[] {
  if (!payload) return []

  const collected: VaLetterIndexRow[] = []
  const seenPayload = new Set<unknown>()

  function collect(value: unknown, depth: number) {
    if (value == null || depth > 8) return
    if (typeof value !== 'object') return
    if (seenPayload.has(value)) return
    seenPayload.add(value)

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === 'object') {
          collected.push(normalizeLetterRow(entry as VaLetterIndexRow))
        }
      }
      return
    }

    const record = value as Record<string, unknown>
    const candidates = [
      record.data,
      record.claimLetters,
      record.letters,
      record.documents
    ]

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          if (entry && typeof entry === 'object') {
            collected.push(normalizeLetterRow(entry as VaLetterIndexRow))
          }
        }
        continue
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>
        if (Array.isArray(nested.documents)) {
          for (const entry of nested.documents) {
            if (entry && typeof entry === 'object') {
              collected.push(normalizeLetterRow(entry as VaLetterIndexRow))
            }
          }
        }
        if (Array.isArray(nested.data)) {
          for (const entry of nested.data) {
            if (entry && typeof entry === 'object') {
              collected.push(normalizeLetterRow(entry as VaLetterIndexRow))
            }
          }
        }
      }
    }

    for (const child of Object.values(record)) {
      collect(child, depth + 1)
    }
  }

  collect(payload, 0)

  const deduped = new Map<string, VaLetterIndexRow>()
  for (const row of collected) {
    const key = letterRowId(row) ?? `${row.documentTypeLabel ?? ''}:${row.letterDate ?? ''}:${deduped.size}`
    if (!deduped.has(key)) deduped.set(key, row)
  }

  return [...deduped.values()]
}

function letterRowId(row: VaLetterIndexRow) {
  return row.documentUuid ?? row.documentId ?? row.id ?? null
}

function isDecisionLetterRow(row: VaLetterIndexRow) {
  const label = `${row.documentTypeLabel ?? ''} ${row.documentType ?? ''} ${row.typeDescription ?? ''} ${row.subject ?? ''}`.toLowerCase()
  if (!label.trim()) return true
  return /decision|rating|claim letter|notification|denial|grant|benefit/.test(label)
}

function resolveEntityForLetter(
  row: VaLetterIndexRow,
  claims: ParsedVaClaim[],
  appeals: ParsedVaAppeal[]
): { entityKind: 'claim' | 'appeal', entityId: string, entityTitle: string } | null {
  const claimId = readString(row.claimId) ?? readString(row.benefitsClaimId)
  if (claimId) {
    const claim = claims.find(entry => entry.id === claimId)
    return {
      entityKind: 'claim',
      entityId: claimId,
      entityTitle: claim?.title ?? 'VA claim'
    }
  }

  const appealId = readString(row.appealId)
  if (appealId) {
    const appeal = appeals.find(entry => entry.id === appealId)
    return {
      entityKind: 'appeal',
      entityId: appealId,
      entityTitle: appeal?.title ?? 'VA appeal'
    }
  }

  const decidedClaim = claims.find(claim =>
    claim.decisionLetterSent || claim.status === 'COMPLETE' || Boolean(claim.closeDate)
  )
  if (decidedClaim && claims.length === 1) {
    return { entityKind: 'claim', entityId: decidedClaim.id, entityTitle: decidedClaim.title }
  }
  if (decidedClaim) {
    return { entityKind: 'claim', entityId: decidedClaim.id, entityTitle: decidedClaim.title }
  }

  const decidedAppeal = appeals.find(appeal => !appeal.active)
  if (decidedAppeal && appeals.length === 1) {
    return { entityKind: 'appeal', entityId: decidedAppeal.id, entityTitle: decidedAppeal.title }
  }

  if (claims.length === 1) {
    return { entityKind: 'claim', entityId: claims[0]!.id, entityTitle: claims[0]!.title }
  }

  return null
}

async function listClaimLettersFromVa(
  identifier: VaClaimantIdentifier | null
): Promise<VaLetterIndexRow[]> {
  const searchData = identifier ? claimantIdentifierRequestData(identifier) : null

  if (searchData && (searchData.fileNumber || searchData.participantId != null)) {
    const searchRes = await postJsonViaVaGovTab(
      'https://api.va.gov/services/documents/v1/claim-letters/search',
      { data: searchData }
    )
    if (searchRes?.ok) {
      const rows = unwrapLetterRows(searchRes.data).filter(isDecisionLetterRow)
      if (rows.length) return rows
    }
  }

  const listRes = await vaFetch('https://api.va.gov/v0/claim_letters')
  if (listRes.ok) {
    const rows = unwrapLetterRows(listRes.data).filter(isDecisionLetterRow)
    if (rows.length) return rows
  }

  if (searchData && (searchData.fileNumber || searchData.participantId != null)) {
    const retry = await postJsonViaVaGovTab(
      'https://api.va.gov/services/documents/v1/claim-letters/search',
      { data: searchData }
    )
    if (retry?.ok) {
      return unwrapLetterRows(retry.data).filter(isDecisionLetterRow)
    }
  }

  return []
}

async function downloadLetterBase64(
  row: VaLetterIndexRow,
  identifier: VaClaimantIdentifier | null
): Promise<string | null> {
  const documentUuid = letterRowId(row)
  if (!documentUuid) return null

  const idData = identifier ? claimantIdentifierRequestData(identifier) : {}

  if (row.downloadUrl && row.downloadUrl.startsWith('https://api.va.gov/')) {
    const direct = await fetchBinaryViaVaGovTab(row.downloadUrl)
    if (direct?.ok && direct.base64) return direct.base64
  }

  if (idData.fileNumber || idData.participantId != null) {
    const modern = await fetchBinaryViaVaGovTab(
      'https://api.va.gov/services/documents/v1/claim-letters/download',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/octet-stream' },
        body: JSON.stringify({
          data: {
            documentUuid,
            ...idData
          }
        })
      }
    )
    if (modern?.ok && modern.base64) return modern.base64
  }

  const legacyUrl = `https://api.va.gov/v0/claim_letters/${encodeURIComponent(documentUuid)}/download`
  const legacy = await fetchBinaryViaVaGovTab(legacyUrl)
  if (legacy?.ok && legacy.base64) return legacy.base64

  return null
}

function base64ByteLength(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/**
 * Download decision letter PDFs from VA.gov (session cookies) and encode for ClaimBuilder upload.
 * Nothing is stored in extension storage — callers POST to the webapp immediately.
 */
export async function buildDecisionLetterUploadsForTrack(input: {
  claims: ParsedVaClaim[]
  appeals: ParsedVaAppeal[]
}): Promise<TrackLetterUploadPayload[]> {
  const identifier = await fetchVaClaimantIdentifier(input.claims)
  const rows = await listClaimLettersFromVa(identifier)
  if (!rows.length) return []

  const uploads: TrackLetterUploadPayload[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (uploads.length >= MAX_LETTERS_PER_SYNC) break

    const entity = resolveEntityForLetter(row, input.claims, input.appeals)
    if (!entity) continue

    const dedupeKey = `${entity.entityKind}:${entity.entityId}:${letterRowId(row) ?? ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const contentBase64 = await downloadLetterBase64(row, identifier)
    if (!contentBase64) continue
    if (base64ByteLength(contentBase64) > MAX_LETTER_BYTES) continue

    const letterDate = readString(row.letterDate)
      ?? readString(row.documentDate)
      ?? readString(row.receivedAt)
      ?? null

    const safeName = readString(row.subject, 40)?.replace(/[^\w.-]+/g, '-') || `va-decision-${entity.entityId.slice(0, 8)}`

    uploads.push({
      entityKind: entity.entityKind,
      entityId: entity.entityId,
      filename: `${safeName}.pdf`,
      contentBase64,
      letterDate,
      entityTitle: entity.entityTitle
    })
  }

  return uploads
}
