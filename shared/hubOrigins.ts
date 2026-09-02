/** Hub production hosts — canonical TLD is .com (.us legacy links redirect). */
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

export function normalizeHubOriginToCom(origin: string) {
  return origin.replace(/veteranscentralhub\.us/g, 'veteranscentralhub.com')
}

export function hubOriginFromCookieDomain(domain: string): string | null {
  const normalized = domain.toLowerCase()
  if (normalized.includes('veteranscentralhub.us')) {
    const origin = normalized.includes('www.')
      ? 'https://www.veteranscentralhub.us'
      : 'https://veteranscentralhub.us'
    return normalizeHubOriginToCom(origin)
  }
  if (normalized.includes('veteranscentralhub.com')) {
    return normalized.includes('www.')
      ? 'https://www.veteranscentralhub.com'
      : 'https://veteranscentralhub.com'
  }
  return null
}

export function hubUrlOnOrigin(origin: string, path: string) {
  const base = normalizeHubOriginToCom(origin.replace(/\/$/, ''))
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
}

let lastDetectedHubOrigin = DEFAULT_HUB_ORIGIN

export function getDetectedHubOrigin() {
  return normalizeHubOriginToCom(lastDetectedHubOrigin)
}

export function setDetectedHubOrigin(origin: string) {
  const normalized = normalizeHubOriginToCom(origin)
  if (VCH_HUB_ORIGINS.includes(origin as typeof VCH_HUB_ORIGINS[number]) || normalized.includes('veteranscentralhub.com')) {
    lastDetectedHubOrigin = normalized
  }
}
