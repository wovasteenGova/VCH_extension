import { describe, expect, it } from 'vitest'
import { isClaimBuilderBridgeOrigin, isClaimBuilderTrackCacheRequest, VCH_CLAIMBUILDER_PAGE_SOURCE, VCH_PROBE_VA_TRACK_CACHE } from '../shared/claimBuilderBridge'

describe('page bridge boundary', () => {
  it('accepts only explicit VCH app origins', () => {
    expect(isClaimBuilderBridgeOrigin('https://claimbuilder.veteranscentralhub.com')).toBe(true)
    expect(isClaimBuilderBridgeOrigin('https://extension.veteranscentralhub.com')).toBe(true)
    for (const origin of ['https://unknown.veteranscentralhub.com', 'http://claimbuilder.veteranscentralhub.com', 'https://claimbuilder.veteranscentralhub.com.evil.example', 'https://claimbuilder.veteranscentralhub.com:444', 'null']) {
      expect(isClaimBuilderBridgeOrigin(origin)).toBe(false)
    }
  })
  it('validates the request type and bounds request IDs', () => {
    const data = { source: VCH_CLAIMBUILDER_PAGE_SOURCE, type: VCH_PROBE_VA_TRACK_CACHE, requestId: 'test' }
    expect(isClaimBuilderTrackCacheRequest(data)).toBe(true)
    expect(isClaimBuilderTrackCacheRequest({ ...data, requestId: 'x'.repeat(129) })).toBe(false)
    expect(isClaimBuilderTrackCacheRequest({ ...data, source: 'unknown' })).toBe(false)
  })
})
