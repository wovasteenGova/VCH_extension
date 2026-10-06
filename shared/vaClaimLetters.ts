import type { ParsedVaAppeal } from './vaAppealParse'
import type { ParsedVaClaim } from './vaClaimParse'
import { vaFetch } from './vaClient'
import {
  claimantIdentifierRequestData,
  fetchVaClaimantIdentifier,
  type VaClaimantIdentifier
} from './vaClaimantIdentifier'
import {
  fetchVaBinaryInPage,
  fetchVaJsonInPage,
  isVaGovPageContext
} from './vaInPageFetch'
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
  /** VBMS document type code (required for legacy GET download, e.g. 184, 27). */
  document_type?: string
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

function readDocumentTypeCode(record: Record<string, unknown>) {
  const raw = record.document_type
    ?? record.documentType
    ?? record.docType
    ?? record.doc_type
  if (raw == null) return undefined
  const digits = String(raw).trim()
  return /^\d{1,6}$/.test(digits) ? digits : undefined
}

/** Flatten JSON:API claim_letters rows (same shape VeteranHQ claimPage expects). */
export function rowFromClaimLetterEntry(entry: unknown): VaLetterIndexRow | null {
  if (!entry || typeof entry !== 'object') return null
  const record = entry as Record<string, unknown>
  const attrs = record.attributes && typeof record.attributes === 'object'
    ? record.attributes as Record<string, unknown>
    : {}
  const merged: Record<string, unknown> = { ...attrs, ...record }
  const topId = readString(record.id, 100)
  const attrDocId = readString(attrs.document_id, 100)
    ?? readString(attrs.documentId, 100)
    ?? readString(attrs.documentUuid, 100)
  const flatDocId = readString(merged.document_id, 100)
    ?? readString(merged.documentId, 100)
    ?? readString(merged.documentUuid, 100)
  const documentId = attrDocId ?? flatDocId ?? topId

  const documentType = readDocumentTypeCode(merged)
  const letterTypeLabel = readString(merged.letterType, 200)
    ?? readString(merged.letter_type, 200)
    ?? readString(merged.typeDescription, 200)
    ?? readString(merged.documentTypeLabel, 200)

  return normalizeLetterRow({
    documentUuid: documentId,
    documentId,
    id: topId,
    document_type: documentType,
    documentType: documentType,
    claimId: readString(merged.claimId, 80) ?? readString(merged.claim_id, 80),
    benefitsClaimId: readString(merged.benefitsClaimId, 80) ?? readString(merged.benefits_claim_id, 80),
    appealId: readString(merged.appealId, 80) ?? readString(merged.appeal_id, 80),
    receivedAt: readString(merged.receivedAt, 40) ?? readString(merged.received_at, 40),
    documentDate: readString(merged.documentDate, 40) ?? readString(merged.document_date, 40),
    letterDate: readString(merged.letterDate, 40)
      ?? readString(merged.letter_date, 40)
      ?? readString(merged.received_at, 40),
    uploadedDateTime: readString(merged.uploadedDateTime, 40),
    documentTypeLabel: letterTypeLabel,
    typeDescription: letterTypeLabel,
    subject: readString(merged.subject, 200),
    downloadUrl: readString(merged.downloadUrl, 500) ?? readString(merged.download_url, 500)
  })
}

function claimLettersTotalPages(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 1
  const record = payload as Record<string, unknown>
  const meta = record.meta && typeof record.meta === 'object'
    ? record.meta as Record<string, unknown>
    : null
  const pagination = meta?.pagination && typeof meta.pagination === 'object'
    ? meta.pagination as Record<string, unknown>
    : record.pagination && typeof record.pagination === 'object'
      ? record.pagination as Record<string, unknown>
      : meta
  const total = pagination?.totalPages ?? pagination?.total_pages ?? 1
  const n = typeof total === 'number' ? total : Number(total)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.trunc(n), 100)
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
  const documentType = row.document_type
    ?? readDocumentTypeCode(row as unknown as Record<string, unknown>)
    ?? row.documentType
  return {
    ...row,
    documentUuid,
    documentId: documentUuid,
    document_type: documentType,
    documentType,
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
        const row = rowFromClaimLetterEntry(entry)
        if (row) collected.push(row)
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

    let handled = false
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        handled = true
        for (const entry of candidate) {
          const row = rowFromClaimLetterEntry(entry)
          if (row) collected.push(row)
        }
        continue
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>
        if (Array.isArray(nested.documents)) {
          handled = true
          for (const entry of nested.documents) {
            const row = rowFromClaimLetterEntry(entry)
            if (row) collected.push(row)
          }
        }
        if (Array.isArray(nested.data)) {
          handled = true
          for (const entry of nested.data) {
            const row = rowFromClaimLetterEntry(entry)
            if (row) collected.push(row)
          }
        }
      }
    }

    if (!handled) {
      for (const child of Object.values(record)) {
        collect(child, depth + 1)
      }
    }
  }

  collect(payload, 0)

  const deduped = new Map<string, VaLetterIndexRow>()
  for (const row of collected) {
    const id = letterRowId(row)
    const key = id
      ? `${id}:${row.document_type ?? row.documentType ?? ''}`
      : `${row.documentTypeLabel ?? ''}:${row.letterDate ?? ''}:${deduped.size}`
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

async function postClaimLetterSearch(body: unknown) {
  const url = 'https://api.va.gov/services/documents/v1/claim-letters/search'
  if (isVaGovPageContext()) {
    return fetchVaJsonInPage(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  }
  return postJsonViaVaGovTab(url, body)
}

const VA_CLAIM_LETTERS_INDEX = 'https://api.va.gov/v0/claim_letters'

async function fetchClaimLettersIndexPage(page: number) {
  const url = `${VA_CLAIM_LETTERS_INDEX}?page=${page}`
  if (isVaGovPageContext()) {
    return fetchVaJsonInPage(url)
  }
  return vaFetch(url)
}

/** Paginated GET /v0/claim_letters (matches VeteranHQ claim-correspondence-v1). */
async function listLegacyClaimLettersPaginated(): Promise<VaLetterIndexRow[]> {
  const all: VaLetterIndexRow[] = []
  const seen = new Set<string>()
  let totalPages = 1

  for (let page = 1; page <= totalPages && page <= 100; page++) {
    const res = await fetchClaimLettersIndexPage(page)
    if (!res.ok) break

    totalPages = claimLettersTotalPages(res.data)
    const rows = unwrapLetterRows(res.data).filter(isDecisionLetterRow)
    for (const row of rows) {
      const key = `${letterRowId(row) ?? ''}:${row.document_type ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(row)
    }

    if (page >= totalPages) break
  }

  return all
}

async function listClaimLettersFromVa(
  identifier: VaClaimantIdentifier | null
): Promise<VaLetterIndexRow[]> {
  const searchData = identifier ? claimantIdentifierRequestData(identifier) : null

  const legacyRows = await listLegacyClaimLettersPaginated()
  if (legacyRows.length) return legacyRows

  if (searchData && (searchData.fileNumber || searchData.participantId != null)) {
    const searchRes = await postClaimLetterSearch({ data: searchData })
    if (searchRes?.ok) {
      const rows = unwrapLetterRows(searchRes.data).filter(isDecisionLetterRow)
      if (rows.length) return rows
    }
  }

  if (searchData && (searchData.fileNumber || searchData.participantId != null)) {
    const retry = await postClaimLetterSearch({ data: searchData })
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

  const downloadModern = async () => {
    const url = 'https://api.va.gov/services/documents/v1/claim-letters/download'
    const body = JSON.stringify({ data: { documentUuid, ...idData } })
    const headers = { 'Content-Type': 'application/json', Accept: 'application/octet-stream' }
    if (isVaGovPageContext()) {
      return fetchVaBinaryInPage(url, { method: 'POST', headers, body })
    }
    return fetchBinaryViaVaGovTab(url, { method: 'POST', headers, body })
  }

  const downloadLegacy = async () => {
    const docType = row.document_type
      ?? readDocumentTypeCode(row as unknown as Record<string, unknown>)
      ?? row.documentType
    const typeQuery = docType && /^\d{1,6}$/.test(String(docType))
      ? `?document_type=${encodeURIComponent(String(docType))}`
      : ''
    const legacyUrl = `${VA_CLAIM_LETTERS_INDEX}/${encodeURIComponent(documentUuid)}${typeQuery}`
    if (isVaGovPageContext()) {
      return fetchVaBinaryInPage(legacyUrl)
    }
    return fetchBinaryViaVaGovTab(legacyUrl)
  }

  if (row.downloadUrl && row.downloadUrl.startsWith('https://api.va.gov/')) {
    const direct = isVaGovPageContext()
      ? await fetchVaBinaryInPage(row.downloadUrl)
      : await fetchBinaryViaVaGovTab(row.downloadUrl)
    if (direct?.ok && direct.base64) return direct.base64
  }

  if (idData.fileNumber || idData.participantId != null) {
    const modern = await downloadModern()
    if (modern?.ok && modern.base64) return modern.base64
  }

  const legacy = await downloadLegacy()
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
