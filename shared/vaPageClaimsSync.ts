import { parseVaClaim } from './vaClaimParse'
import { saveVaClaimsCache } from './vaDeviceCache'
import { fetchVaClaimsList, unwrapVaData } from './vaClient'

export type VaPageClaimsSyncResult = {
  ok: boolean
  count: number
  error?: string
}

export async function syncClaimsFromVaPage(): Promise<VaPageClaimsSyncResult> {
  const response = await fetchVaClaimsList()
  if (!response.ok) {
    return { ok: false, count: 0, error: response.error }
  }

  const list = unwrapVaData<unknown[]>(response.data) || []
  const claims = list
    .map(item => parseVaClaim(item))
    .filter(Boolean)

  await saveVaClaimsCache(claims)
  return { ok: true, count: claims.length }
}
