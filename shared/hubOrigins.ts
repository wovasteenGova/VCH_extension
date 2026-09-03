/** Hub production hosts — .com only for links and API probes. */
export const VCH_HUB_ORIGINS = [
  'https://www.veteranscentralhub.com',
  'https://veteranscentralhub.com'
] as const

export const DEFAULT_HUB_ORIGIN = 'https://www.veteranscentralhub.com'

/** Cookie lookup includes legacy .us installs still signed in there. */
export const HUB_COOKIE_DOMAINS = [
  'veteranscentralhub.com',
  '.veteranscentralhub.com',
  'www.veteranscentralhub.com',
  'claimbuilder.veteranscentralhub.com',
  '.claimbuilder.veteranscentralhub.com',
  'veteranscentralhub.us',
  '.veteranscentralhub.us',
  'www.veteranscentralhub.us'
] as const

export function normalizeHubOriginToCom(origin: string) {
  return origin.replace(/veteranscentralhub\.us/g, 'veteranscentralhub.com')
}

export function hubOriginFromCookieDomain(domain: string): string | null {
  const normalized = domain.toLowerCase()
  if (normalized.includes('veteranscentralhub')) {
    return DEFAULT_HUB_ORIGIN
  }
  return null
}

export function hubUrlOnOrigin(origin: string, path: string) {
  const base = normalizeHubOriginToCom(origin.replace(/\/$/, '')) || DEFAULT_HUB_ORIGIN
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
}

let lastDetectedHubOrigin = DEFAULT_HUB_ORIGIN

export function getDetectedHubOrigin() {
  return normalizeHubOriginToCom(lastDetectedHubOrigin)
}

export function setDetectedHubOrigin(origin: string) {
  lastDetectedHubOrigin = normalizeHubOriginToCom(origin) || DEFAULT_HUB_ORIGIN
}
