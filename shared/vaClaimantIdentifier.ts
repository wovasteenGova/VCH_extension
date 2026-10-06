import { fetchVaClaimDetail, fetchVaUser } from './vaClient'
import type { ParsedVaClaim } from './vaClaimParse'

export type VaClaimantIdentifier = {
  fileNumber?: string
  participantId?: number
}

const FILE_NUMBER_KEYS = [
  'fileNumber',
  'file_number',
  'birls_id',
  'birlsId',
  'va_file_number',
  'vaFileNumber'
] as const

const PARTICIPANT_KEYS = ['participantId', 'participant_id'] as const

function normalizeFileNumber(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length >= 8 && digits.length <= 9) return digits
  return undefined
}

function normalizeParticipantId(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.trunc(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const value = Number(raw.trim())
    if (Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

function mergeIdentifier(
  target: VaClaimantIdentifier,
  next: VaClaimantIdentifier | null | undefined
) {
  if (!next) return
  if (!target.fileNumber && next.fileNumber) target.fileNumber = next.fileNumber
  if (target.participantId == null && next.participantId != null) {
    target.participantId = next.participantId
  }
}

/** Walk VA JSON payloads for VBMS file number / participant id (MVI profile fields). */
export function parseVaClaimantIdentifier(payload: unknown): VaClaimantIdentifier | null {
  const found: VaClaimantIdentifier = {}
  const seen = new Set<unknown>()

  function walk(value: unknown, depth: number) {
    if (value == null || depth > 10) return
    if (typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, depth + 1)
      return
    }

    const record = value as Record<string, unknown>
    for (const key of FILE_NUMBER_KEYS) {
      const fileNumber = normalizeFileNumber(record[key])
      if (fileNumber) found.fileNumber = fileNumber
    }
    for (const key of PARTICIPANT_KEYS) {
      const participantId = normalizeParticipantId(record[key])
      if (participantId != null) found.participantId = participantId
    }

    for (const child of Object.values(record)) {
      walk(child, depth + 1)
    }
  }

  walk(payload, 0)

  if (!found.fileNumber && found.participantId == null) return null
  return found
}

export function claimantIdentifierRequestData(identifier: VaClaimantIdentifier) {
  const data: Record<string, string | number> = {}
  if (identifier.participantId != null) data.participantId = identifier.participantId
  if (identifier.fileNumber) data.fileNumber = identifier.fileNumber
  return data
}

export async function fetchVaClaimantIdentifier(
  claims: ParsedVaClaim[] = []
): Promise<VaClaimantIdentifier | null> {
  const userRes = await fetchVaUser()
  if (userRes.ok) {
    const fromUser = parseVaClaimantIdentifier(userRes.data)
    if (fromUser?.fileNumber || fromUser?.participantId != null) return fromUser
  }

  for (const claim of claims.slice(0, 3)) {
    if (!claim.id) continue
    const detailRes = await fetchVaClaimDetail(claim.id)
    if (!detailRes.ok) continue
    const fromDetail = parseVaClaimantIdentifier(detailRes.data)
    if (fromDetail?.fileNumber || fromDetail?.participantId != null) return fromDetail
  }

  return null
}

export function mergeClaimantIdentifiers(
  ...parts: Array<VaClaimantIdentifier | null | undefined>
): VaClaimantIdentifier | null {
  const merged: VaClaimantIdentifier = {}
  for (const part of parts) mergeIdentifier(merged, part)
  if (!merged.fileNumber && merged.participantId == null) return null
  return merged
}
