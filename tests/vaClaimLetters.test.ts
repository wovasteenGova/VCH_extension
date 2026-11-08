import { describe, expect, it } from 'vitest'
import { rowFromClaimLetterEntry, unwrapLetterRows } from '../shared/vaClaimLetters'

describe('vaClaimLetters helpers', () => {
  it('parses the snake_case schema verified against the live VA.gov index', () => {
    const row = rowFromClaimLetterEntry({
      document_id: '11111111-1111-4111-8111-111111111111',
      series_id: '11111111-1111-4111-8111-111111111111',
      type_description: 'Claim decision (or other notification, like Intent to File)',
      type_id: '184', doc_type: '184', subject: null,
      received_at: '2026-09-25', mime_type: 'application/pdf', restricted: false
    })
    expect(row?.documentUuid).toBe('11111111-1111-4111-8111-111111111111')
    expect(row?.document_type).toBe('184')
    expect(row?.documentTypeLabel).toBe('Claim decision (or other notification, like Intent to File)')
    expect(row?.letterDate).toBe('2026-09-25')
    expect(row?.claimId).toBeUndefined()
  })
  it('unwraps JSON:API claim_letters index rows', () => {
    const row = rowFromClaimLetterEntry({
      id: 'letter-uuid',
      type: 'claim_letters',
      attributes: {
        document_id: 'letter-uuid',
        document_type: '184',
        letter_type: 'Board Of Appeals Decision Letter',
        received_at: '2023-07-10'
      }
    })
    expect(row?.documentUuid).toBe('letter-uuid')
    expect(row?.document_type).toBe('184')
    expect(row?.documentTypeLabel).toMatch(/Board Of Appeals/)
  })

  it('unwraps legacy claim letter list payloads', () => {
    const rows = unwrapLetterRows({
      data: [{ documentUuid: '{abc}', claimId: 'claim-1', document_type: '27' }]
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.documentUuid).toBe('abc')
    expect(rows[0]?.document_type).toBe('27')
  })

  it('unwraps modern documents service payloads', () => {
    const rows = unwrapLetterRows({
      data: {
        documents: [{
          documentUuid: '{12345678-ABCD-0123-cdef-124345679ABC}',
          documentTypeLabel: 'Rating Decision',
          uploadedDateTime: '2016-02-04T17:51:56Z'
        }]
      }
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.documentTypeLabel).toMatch(/Rating Decision/)
  })
})
