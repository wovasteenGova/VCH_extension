import { persistLiveVaCaches } from './vaCacheSync'
import { readVaDeviceCache } from './vaDeviceCache'

export type VaPageClaimsSyncResult = {
  ok: boolean
  count: number
  appeals: number
  error?: string
}

export async function syncClaimsFromVaPage(): Promise<VaPageClaimsSyncResult> {
  const result = await persistLiveVaCaches()
  const cache = await readVaDeviceCache()
  const count = result.claims || cache.claims.length

  if (count > 0 || result.appeals > 0 || result.ratings || result.profile) {
    return { ok: true, count, appeals: result.appeals }
  }

  return {
    ok: false,
    count: 0,
    appeals: 0,
    error: 'Could not save claims from this page. Wait for the list to finish loading, then tap Sync.'
  }
}
