import { describe, expect, it } from 'vitest'
import {
  claimantIdentifierRequestData,
  parseVaClaimantIdentifier
} from '../shared/vaClaimantIdentifier'

describe('vaClaimantIdentifier', () => {
  it('finds nested file number and participant id', () => {
    const parsed = parseVaClaimantIdentifier({
      data: {
        attributes: {
          profile: {
            participant_id: 999012105,
            birls_id: '123456789'
          }
        }
      }
    })

    expect(parsed?.participantId).toBe(999012105)
    expect(parsed?.fileNumber).toBe('123456789')
  })

  it('builds documents API search payload', () => {
    expect(claimantIdentifierRequestData({
      participantId: 42,
      fileNumber: '987654321'
    })).toEqual({
      participantId: 42,
      fileNumber: '987654321'
    })
  })
})
