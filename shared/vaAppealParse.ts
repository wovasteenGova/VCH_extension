import { formatVaEnumLabel } from './vaClaimParse'

export type ParsedVaAppealIssue = {
  description: string
  active: boolean
  lastAction?: string
  date?: string
  disposition?: string
}

export type ParsedVaAppeal = {
  id: string
  appealKind: string
  appealKindLabel: string
  title: string
  subtitle?: string
  statusLabel: string
  statusType: string
  active: boolean
  updatedAt?: string
  filedDate?: string
  programArea?: string
  location?: string
  description?: string
  issues: ParsedVaAppealIssue[]
  issueCount: number
}

const APPEAL_KIND_LABELS: Record<string, string> = {
  legacyAppeal: 'Legacy appeal',
  higherLevelReview: 'Higher-Level Review',
  supplementalClaim: 'Supplemental claim',
  appeal: 'Board appeal'
}

const APPEAL_STATUS_LABELS: Record<string, string> = {
  scheduled_hearing: 'Hearing scheduled',
  pending_hearing_scheduling: 'Pending hearing scheduling',
  on_docket: 'On docket',
  pending_certification_ssoc: 'Pending certification (SSOC)',
  pending_certification: 'Pending certification',
  pending_form9: 'Pending Form 9',
  pending_soc: 'Pending SOC',
  stayed: 'Stayed',
  at_vso: 'At VSO',
  bva_development: 'BVA development',
  decision_in_progress: 'Decision in progress',
  bva_decision: 'BVA decision',
  field_grant: 'Field grant',
  withdrawn: 'Withdrawn',
  ftr: 'Failure to respond',
  ramp: 'RAMP',
  death: 'Closed (death)',
  reconsideration: 'Reconsideration',
  other_close: 'Closed',
  remand_ssoc: 'Remand (SSOC)',
  remand: 'Remand',
  merged: 'Merged',
  evidentiary_period: 'Evidentiary period',
  ama_remand: 'AMA remand',
  post_bva_dta_decision: 'Post-BVA DTA decision',
  bva_decision_effectuation: 'BVA decision effectuation',
  sc_received: 'Supplemental claim received',
  sc_recieved: 'Supplemental claim received',
  sc_decision: 'Supplemental claim decided',
  sc_closed: 'Supplemental claim closed',
  hlr_received: 'HLR received',
  hlr_dta_error: 'HLR DTA error',
  hlr_decision: 'HLR decided',
  hlr_closed: 'HLR closed',
  statutory_opt_in: 'Statutory opt-in'
}

/** VA API typo — normalize before label lookup */
function normalizeStatusType(value: string) {
  if (value === 'sc_recieved') return 'sc_received'
  return value
}

function readStatusType(status: unknown): string {
  if (typeof status === 'string') return normalizeStatusType(status)
  if (status && typeof status === 'object') {
    const type = (status as Record<string, unknown>).type
    if (typeof type === 'string') return normalizeStatusType(type)
  }
  return ''
}

function parseIssues(raw: unknown): ParsedVaAppealIssue[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const description = typeof row.description === 'string' ? row.description.trim() : ''
      if (!description) return null
      return {
        description,
        active: row.active === true,
        lastAction: typeof row.lastAction === 'string' ? row.lastAction : undefined,
        date: typeof row.date === 'string' ? row.date : undefined
      }
    })
    .filter(Boolean) as ParsedVaAppealIssue[]
}

function readFiledDate(attrs: Record<string, unknown>): string | undefined {
  const events = Array.isArray(attrs.events) ? attrs.events : []
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const row = event as Record<string, unknown>
    const type = typeof row.type === 'string' ? row.type : ''
    if (type.endsWith('_request') && typeof row.date === 'string') {
      return row.date
    }
  }
  return undefined
}

function shortConditionLabel(text: string) {
  const gerd = text.match(/gastroesophageal reflux disease(?:\s*\(GERD\))?|\(GERD\)|\bGERD\b/i)
  if (gerd) return 'GERD'
  const paren = text.match(/\(([^)]+)\)/)
  if (paren?.[1] && paren[1].length <= 40) return paren[1]
  if (text.length <= 48) return text
  return `${text.slice(0, 45).trim()}…`
}

function buildAppealTitle(
  appealKindLabel: string,
  description: string,
  issues: ParsedVaAppealIssue[],
  active: boolean
) {
  const activeIssue = issues.find(issue => issue.active)
  const focus = activeIssue?.description || description
  const condition = focus ? shortConditionLabel(focus) : ''

  if (condition) {
    return active ? `${appealKindLabel} · ${condition}` : `${appealKindLabel} · ${condition}`
  }

  return appealKindLabel
}

function buildAppealSubtitle(
  description: string,
  issues: ParsedVaAppealIssue[],
  active: boolean
) {
  const activeIssue = issues.find(issue => issue.active)
  if (activeIssue?.description) return activeIssue.description
  if (active && description) return description
  return description || undefined
}

export function parseVaAppeal(raw: unknown): ParsedVaAppeal | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>

  const id = typeof item.id === 'string' ? item.id : ''
  if (!id) return null

  const attrs = (item.attributes && typeof item.attributes === 'object')
    ? item.attributes as Record<string, unknown>
    : item

  const appealKind = typeof item.type === 'string'
    ? item.type
    : typeof attrs.type === 'string'
      ? attrs.type
      : 'appeal'

  const appealKindLabel = APPEAL_KIND_LABELS[appealKind] ?? formatVaEnumLabel(appealKind)
  const statusType = readStatusType(attrs.status)
  const description = typeof attrs.description === 'string' ? attrs.description.trim() : ''
  const issues = parseIssues(attrs.issues)
  const active = attrs.active === true

  return {
    id,
    appealKind,
    appealKindLabel,
    title: buildAppealTitle(appealKindLabel, description, issues, active),
    subtitle: buildAppealSubtitle(description, issues, active),
    statusType,
    statusLabel: formatVaEnumLabel(statusType, APPEAL_STATUS_LABELS),
    active,
    updatedAt: typeof attrs.updated === 'string' ? attrs.updated : undefined,
    filedDate: readFiledDate(attrs),
    programArea: typeof attrs.programArea === 'string' ? attrs.programArea : undefined,
    location: typeof attrs.location === 'string' ? attrs.location : undefined,
    description: description || undefined,
    issues,
    issueCount: issues.length
  }
}

export function sortVaAppeals(appeals: ParsedVaAppeal[]) {
  return [...appeals].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const aTime = Date.parse(a.updatedAt || a.filedDate || '')
    const bTime = Date.parse(b.updatedAt || b.filedDate || '')
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
  })
}

export function parseVaAppealsList(raw: unknown): ParsedVaAppeal[] {
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(raw)
      ? raw
      : []
  return sortVaAppeals(
    list.map(item => parseVaAppeal(item)).filter(Boolean) as ParsedVaAppeal[]
  )
}
