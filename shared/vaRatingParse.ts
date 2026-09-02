export type ParsedVaRating = {
  id: string
  name: string
  rating: number | null
  decision?: string
  effectiveDate?: string
  ratingEndDate?: string
  diagnosticCode?: string
  static?: boolean
}

export type ParsedVaRatingsSummary = {
  combinedRating: number | null
  combinedEffectiveDate?: string
  legalEffectiveDate?: string
  ratings: ParsedVaRating[]
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function readAttributes(node: unknown): Record<string, unknown> | null {
  const record = readRecord(node)
  if (!record) return null
  return readRecord(record.attributes) || record
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStatic(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 'Y' || value === 'y') return true
  if (value === false || value === 'false' || value === 'N' || value === 'n') return false
  return undefined
}

function ratingName(attrs: Record<string, unknown>) {
  return readString(attrs.diagnosticText)
    || readString(attrs.diagnosticTypeName)
    || readString(attrs.name)
    || readString(attrs.condition)
    || 'Rated condition'
}

function parseIndividualRating(raw: unknown, index: number): ParsedVaRating | null {
  const attrs = readAttributes(raw)
  if (!attrs) return null

  const record = readRecord(raw)
  const id = readString(record?.id)
    || readString(attrs.disabilityRatingId)
    || `rating-${index}`

  return {
    id,
    name: ratingName(attrs),
    rating: readNumber(attrs.ratingPercentage ?? attrs.disabilityRating ?? attrs.rating),
    decision: readString(attrs.decision),
    effectiveDate: readString(attrs.effectiveDate),
    ratingEndDate: readString(attrs.ratingEndDate),
    diagnosticCode: readString(attrs.diagnosticTypeCode ?? attrs.hyphDiagnosticTypeCode),
    static: readStatic(attrs.staticInd ?? attrs.staticIndicator)
  }
}

function readIndividualRatings(attrs: Record<string, unknown>) {
  const list = attrs.individualRatings ?? attrs.individual_ratings
  if (!Array.isArray(list)) return []
  return list
    .map((item, index) => parseIndividualRating(item, index))
    .filter(Boolean) as ParsedVaRating[]
}

/** Parse `GET /v0/rated_disabilities` (JSON:API single record + individualRatings). */
export function parseVaRatingsResponse(payload: unknown): ParsedVaRatingsSummary {
  const root = readRecord(payload)
  if (!root) {
    return { combinedRating: null, ratings: [] }
  }

  const dataNode = root.data ?? root
  const attrs = readAttributes(Array.isArray(dataNode) ? dataNode[0] : dataNode)
  if (!attrs) {
    return { combinedRating: null, ratings: [] }
  }

  const combinedRating = readNumber(
    attrs.combinedDisabilityRating ?? attrs.combined_disability_rating ?? attrs.combinedRating
  )

  const ratings = readIndividualRatings(attrs)

  // Some older payloads expose each condition as a top-level data[] item.
  if (ratings.length === 0 && Array.isArray(dataNode)) {
    for (const [index, item] of dataNode.entries()) {
      const parsed = parseIndividualRating(item, index)
      if (parsed) ratings.push(parsed)
    }
  }

  return {
    combinedRating,
    combinedEffectiveDate: readString(attrs.combinedEffectiveDate ?? attrs.combined_effective_date),
    legalEffectiveDate: readString(attrs.legalEffectiveDate ?? attrs.legal_effective_date),
    ratings
  }
}

export function sortRatingsByPercent(ratings: ParsedVaRating[]) {
  return [...ratings].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
}
