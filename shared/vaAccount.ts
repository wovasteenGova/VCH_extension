type Identity = { accountId: string, epoch: string }
let current: Identity | null = null
let cacheEpoch: string | null = null
let pending: Promise<Identity | null> | null = null

export function vaAccountIdFromUser(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const data = (payload as any).data ?? payload
  const attrs = data.attributes ?? data
  const id = attrs.userAccount?.id ?? attrs.user_account?.id ?? attrs.profile?.userUuid ?? attrs.profile?.user_uuid
  return typeof id === 'string' && /^[a-z0-9-]{8,100}$/i.test(id) ? id : null
}

async function establishOwnerViaWorker(accountId: string): Promise<string | null> {
  const result = await browser.runtime.sendMessage({ type: 'VCH_VA_ACCOUNT', accountId })
  return result?.ok && typeof result.epoch === 'string' ? result.epoch : null
}

export async function registerVaAccount(payload: unknown, establishOwner = establishOwnerViaWorker): Promise<Identity | null> {
  const accountId = vaAccountIdFromUser(payload)
  if (!accountId) { current = null; cacheEpoch = null; return null }
  try {
    const epoch = await establishOwner(accountId)
    current = epoch ? { accountId, epoch } : null
    cacheEpoch = current?.epoch ?? null
    return current
  } catch { current = null; cacheEpoch = null; return null }
}

export function currentVaCacheEpoch() { return cacheEpoch }
export function adoptVaCacheEpoch(value: unknown) { cacheEpoch = typeof value === 'string' ? value : null }

export async function verifyVaAccount(fetchUser: () => Promise<{ ok: boolean }>): Promise<Identity | null> {
  if (pending) return pending
  pending = fetchUser().then(result => result.ok ? current : null).finally(() => { pending = null })
  return pending
}

export async function isCurrentVaEpoch(epoch: string) {
  try { return (await browser.runtime.sendMessage({ type: 'VCH_VA_ACCOUNT_CHECK', epoch }))?.ok === true }
  catch { return false }
}
