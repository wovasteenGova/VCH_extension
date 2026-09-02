export const VCH_HUB_URL = import.meta.env.VITE_VCH_HUB_URL || 'https://veteranscentralhub.us'
export const CLAIMBUILDER_URL = import.meta.env.VITE_CLAIMBUILDER_URL || 'https://claimbuilder.veteranscentralhub.us'

export const VA_GOV_ORIGIN = 'https://www.va.gov'

export function isVaGovUrl(url: string) {
  try {
    const { hostname } = new URL(url)
    return hostname === 'www.va.gov' || hostname.endsWith('.va.gov')
  } catch {
    return false
  }
}
