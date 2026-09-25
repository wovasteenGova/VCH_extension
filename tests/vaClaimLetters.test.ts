import { describe, expect, it } from 'vitest'

function unwrapLetterRows(payload: unknown): unknown[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.data)) return record.data
  return []
}

describe('vaClaimLetters helpers', () => {
  it('unwraps claim letter list payloads', () => {
    const rows = unwrapLetterRows({
      data: [{ documentUuid: 'abc', claimId: 'claim-1' }]
    })
    expect(rows).toHaveLength(1)
  })
})
