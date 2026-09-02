/** Hub apex + www on both production TLDs. */
export const VCH_HUB_ORIGINS = [
  'https://www.veteranscentralhub.com',
  'https://veteranscentralhub.com',
  'https://www.veteranscentralhub.us',
  'https://veteranscentralhub.us'
] as const

export const DEFAULT_HUB_ORIGIN = 'https://www.veteranscentralhub.com'

export const HUB_COOKIE_DOMAINS = [
  'veteranscentralhub.com',
  '.veteranscentralhub.com',
  'www.veteranscentralhub.com',
  'veteranscentralhub.us',
  '.veteranscentralhub.us',
  'www.veteranscentralhub.us'
] as const

export function hubOriginFromCookieDomain(domain: string): string | null {
  const normalized = domain.toLowerCase()
  if (normalized.includes('veteranscentralhub.us')) {
    return normalized.includes('www.')
      ? 'https://www.veteranscentralhub.us'
      : 'https://veteranscentralhub.us'
  }
  if (normalized.includes('veteranscentralhub.com')) {
    return normalized.includes('www.')
      ? 'https://www.veteranscentralhub.com'
      : 'https://veteranscentralhub.com'
  }
  return null
}

export function hubUrlOnOrigin(origin: string, path: string) {
  const base = origin.replace(/\/$/, '')
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
}

let lastDetectedHubOrigin = DEFAULT_HUB_ORIGIN

export function getDetectedHubOrigin() {
  return lastDetectedHubOrigin
}

export function setDetectedHubOrigin(origin: string) {
  if (VCH_HUB_ORIGINS.includes(origin as typeof VCH_HUB_ORIGINS[number])) {
    lastDetectedHubOrigin = origin
  }
}
