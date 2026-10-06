import { describe, expect, it } from 'vitest'
import { unwrapLetterRows } from '../shared/vaClaimLetters'

describe('vaClaimLetters helpers', () => {
  it('unwraps legacy claim letter list payloads', () => {
    const rows = unwrapLetterRows({
      data: [{ documentUuid: '{abc}', claimId: 'claim-1' }]
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.documentUuid).toBe('abc')
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
