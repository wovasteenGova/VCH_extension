import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adoptVaCacheEpoch, currentVaCacheEpoch, isCurrentVaEpoch, registerVaAccount, vaAccountIdFromUser } from '../shared/vaAccount'

beforeEach(() => { vi.stubGlobal('browser', { runtime: { sendMessage: vi.fn(async () => ({ ok: true, epoch: 'epoch-test' })) } }) })

describe('VA account identity', () => {
  it('reads live snake_case and camelCase account IDs without relying on personal names or SSNs', () => {
    expect(vaAccountIdFromUser({ data: { attributes: { user_account: { id: 'account-a' }, profile: { first_name: 'Fixture' } } } })).toBe('account-a')
    expect(vaAccountIdFromUser({ data: { attributes: { userAccount: { id: 'account-b' } } } })).toBe('account-b')
    expect(vaAccountIdFromUser({ data: { attributes: { profile: { ssn: 'not-an-account-id' } } } })).toBeNull()
    expect(vaAccountIdFromUser(null)).toBeNull()
  })
  it('propagates the worker generation to writes and checks it before using responses', async () => {
    expect(await registerVaAccount({ data: { attributes: { user_account: { id: 'account-a' } } } })).toMatchObject({ epoch: 'epoch-test' })
    expect(currentVaCacheEpoch()).toBe('epoch-test')
    expect(await isCurrentVaEpoch('epoch-test')).toBe(true)
    adoptVaCacheEpoch(undefined)
    expect(currentVaCacheEpoch()).toBeNull()
  })
})
