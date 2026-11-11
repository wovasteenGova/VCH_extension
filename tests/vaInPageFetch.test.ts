import { beforeEach, describe, expect, it, vi } from 'vitest'
import { probeVaSessionOnCurrentPage } from '../shared/vaInPageFetch'

vi.mock('../shared/privacyConsent', () => ({
  hasLocalDataConsent: vi.fn().mockResolvedValue(true)
}))

vi.mock('../shared/vaRequest', () => ({
  requestVa: vi.fn()
}))

import { hasLocalDataConsent } from '../shared/privacyConsent'
import { requestVa } from '../shared/vaRequest'

describe('probeVaSessionOnCurrentPage', () => {
  beforeEach(() => {
    vi.mocked(hasLocalDataConsent).mockResolvedValue(true)
  })

  it('reports signed in when /v0/user succeeds', async () => {
    vi.mocked(requestVa).mockResolvedValue({ ok: true, status: 200, text: '{}' })
    await expect(probeVaSessionOnCurrentPage()).resolves.toBe('signed_in')
  })

  it('reports signed out on 401', async () => {
    vi.mocked(requestVa).mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' })
    await expect(probeVaSessionOnCurrentPage()).resolves.toBe('signed_out')
  })

  it('stays unknown when consent is off', async () => {
    vi.mocked(hasLocalDataConsent).mockResolvedValue(false)
    await expect(probeVaSessionOnCurrentPage()).resolves.toBe('unknown')
  })
})
