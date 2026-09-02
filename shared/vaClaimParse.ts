export type VaClaimPhaseDates = {
  phaseChangeDate?: string
  currentPhaseBack?: boolean
  latestPhaseType?: string
  previousPhases?: Record<string, string>
}

export type VaClaimContention = {
  name: string
}

export type VaClaimDocument = {
  documentId?: string
  documentTypeLabel?: string
  originalFileName?: string
  uploadDate?: string
}

export type ParsedVaClaim = {
  id: string
  title: string
  claimType: string
  claimTypeCode: string
  status: string
  statusLabel: string
  phase: string
  phaseLabel: string
  phaseChangeDate?: string
  claimDate?: string
  closeDate?: string
  jurisdiction?: string
  tempJurisdiction?: string
  minEstClaimDate?: string
  maxEstClaimDate?: string
  contentions: VaClaimContention[]
  supportingDocuments: VaClaimDocument[]
  trackedItems: unknown[]
  decisionLetterSent: boolean
  developmentLetterSent: boolean
  documentsNeeded: boolean
  previousPhases: Array<{ label: string, date: string }>
}

const STATUS_LABELS: Record<string, string> = {
  INITIAL_REVIEW: 'Initial review',
  CLAIM_RECEIVED: 'Claim received',
  UNDER_REVIEW: 'Under review',
  GATHERING_OF_EVIDENCE: 'Gathering of evidence',
  REVIEW_OF_EVIDENCE: 'Review of evidence',
  PREPARATION_FOR_DECISION: 'Preparation for decision',
  PENDING_DECISION_APPROVAL: 'Pending decision approval',
  COMPLETE: 'Complete',
  CANCELED: 'Canceled',
  CLOSED: 'Closed',
  APPEAL: 'Appeal',
  PENDING: 'Pending'
}

const PHASE_LABELS: Record<string, string> = {
  CLAIM_RECEIVED: 'Claim received',
  UNDER_REVIEW: 'Under review',
  INITIAL_REVIEW: 'Initial review',
  GATHERING_OF_EVIDENCE: 'Gathering of evidence',
  REVIEW_OF_EVIDENCE: 'Review of evidence',
  PREPARATION_FOR_DECISION: 'Preparation for decision',
  PENDING_DECISION_APPROVAL: 'Pending decision approval',
  COMPLETE: 'Complete'
}

const PREVIOUS_PHASE_LABELS: Record<string, string> = {
  phase1CompleteDate: 'Phase 1 complete',
  phase2CompleteDate: 'Phase 2 complete',
  phase3CompleteDate: 'Phase 3 complete',
  phase4CompleteDate: 'Phase 4 complete',
  phase5CompleteDate: 'Phase 5 complete'
}

export function formatVaEnumLabel(value: unknown, map: Record<string, string> = STATUS_LABELS) {
  if (typeof value !== 'string' || !value) return '—'
  if (map[value]) return map[value]
  return value
    .split('_')
    .map(part => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

export function extractClaimAttributes(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  if (record.attributes && typeof record.attributes === 'object') {
    return record.attributes as Record<string, unknown>
  }

  if (record.data && typeof record.data === 'object') {
    const data = record.data as Record<string, unknown>
    if (data.attributes && typeof data.attributes === 'object') {
      return data.attributes as Record<string, unknown>
    }
    return data
  }

  if ('claimType' in record || 'status' in record || 'claimTypeCode' in record) {
    return record
  }

  return null
}

export function extractClaimId(raw: unknown, fallbackId?: string): string | null {
  if (!raw || typeof raw !== 'object') return fallbackId ?? null
  const record = raw as Record<string, unknown>

  const direct = record.id ?? record.claimId
  if (typeof direct === 'string' && direct) return direct
  if (typeof direct === 'number') return String(direct)

  if (record.data && typeof record.data === 'object') {
    const data = record.data as Record<string, unknown>
    if (typeof data.id === 'string' && data.id) return data.id
  }

  return fallbackId ?? null
}

function parsePhaseDates(raw: unknown): VaClaimPhaseDates | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as VaClaimPhaseDates
}

function parseContentions(raw: unknown): VaClaimContention[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const name = (item as Record<string, unknown>).name
      return typeof name === 'string' && name ? { name } : null
    })
    .filter(Boolean) as VaClaimContention[]
}

function parseDocuments(raw: unknown): VaClaimDocument[] {
  if (!Array.isArray(raw)) return []
  const docs: VaClaimDocument[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const doc: VaClaimDocument = {
      documentId: typeof row.documentId === 'string' ? row.documentId : undefined,
      documentTypeLabel: typeof row.documentTypeLabel === 'string' ? row.documentTypeLabel : undefined,
      originalFileName: typeof row.originalFileName === 'string' ? row.originalFileName : undefined,
      uploadDate: typeof row.uploadDate === 'string' ? row.uploadDate : undefined
    }
    if (doc.documentTypeLabel || doc.originalFileName) docs.push(doc)
  }
  return docs
}

function parsePreviousPhases(phaseDates: VaClaimPhaseDates | null): Array<{ label: string, date: string }> {
  if (!phaseDates?.previousPhases || typeof phaseDates.previousPhases !== 'object') return []
  return Object.entries(phaseDates.previousPhases)
    .filter(([, date]) => typeof date === 'string' && date)
    .map(([key, date]) => ({
      label: PREVIOUS_PHASE_LABELS[key] ?? formatVaEnumLabel(key.replace(/CompleteDate$/i, '')),
      date: date as string
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

export function formatVaDateRange(min?: string, max?: string) {
  if (min && max) return `${formatVaDateShort(min)} – ${formatVaDateShort(max)}`
  if (min) return `From ${formatVaDateShort(min)}`
  if (max) return `Until ${formatVaDateShort(max)}`
  return '—'
}

export function formatVaDateShort(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed)
}

export function parseVaClaim(raw: unknown, fallbackId?: string): ParsedVaClaim | null {
  const attrs = extractClaimAttributes(raw)
  if (!attrs) return null

  const id = extractClaimId(raw, fallbackId)
  if (!id) return null

  const phaseDates = parsePhaseDates(attrs.claimPhaseDates)
  const status = typeof attrs.status === 'string' ? attrs.status : ''
  const latestPhase = phaseDates?.latestPhaseType ?? ''

  const title = typeof attrs.displayTitle === 'string' && attrs.displayTitle
    ? attrs.displayTitle
    : typeof attrs.claimType === 'string' && attrs.claimType
      ? attrs.claimType
      : typeof attrs.claimTypeBase === 'string' && attrs.claimTypeBase
        ? attrs.claimTypeBase
        : 'VA claim'

  return {
    id,
    title,
    claimType: typeof attrs.claimType === 'string' ? attrs.claimType : '—',
    claimTypeCode: typeof attrs.claimTypeCode === 'string' ? attrs.claimTypeCode : '—',
    status,
    statusLabel: formatVaEnumLabel(status),
    phase: latestPhase,
    phaseLabel: formatVaEnumLabel(latestPhase, PHASE_LABELS),
    phaseChangeDate: phaseDates?.phaseChangeDate,
    claimDate: typeof attrs.claimDate === 'string' ? attrs.claimDate : undefined,
    closeDate: typeof attrs.closeDate === 'string' ? attrs.closeDate : undefined,
    jurisdiction: typeof attrs.jurisdiction === 'string' ? attrs.jurisdiction : undefined,
    tempJurisdiction: typeof attrs.tempJurisdiction === 'string' ? attrs.tempJurisdiction : undefined,
    minEstClaimDate: typeof attrs.minEstClaimDate === 'string' ? attrs.minEstClaimDate : undefined,
    maxEstClaimDate: typeof attrs.maxEstClaimDate === 'string' ? attrs.maxEstClaimDate : undefined,
    contentions: parseContentions(attrs.contentions),
    supportingDocuments: parseDocuments(attrs.supportingDocuments),
    trackedItems: Array.isArray(attrs.trackedItems) ? attrs.trackedItems : [],
    decisionLetterSent: attrs.decisionLetterSent === true,
    developmentLetterSent: attrs.developmentLetterSent === true,
    documentsNeeded: attrs.documentsNeeded === true,
    previousPhases: parsePreviousPhases(phaseDates)
  }
}

export function mergeClaimDetail(listClaim: ParsedVaClaim, detailRaw: unknown): ParsedVaClaim {
  const parsed = parseVaClaim(detailRaw, listClaim.id)
  return parsed ?? listClaim
}
