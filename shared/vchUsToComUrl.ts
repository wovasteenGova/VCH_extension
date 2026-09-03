const VCH_ROOT_US = 'veteranscentralhub.us'
const VCH_ROOT_COM = 'veteranscentralhub.com'

function normalizeHostname(value: string) {
  return String(value || '').trim().toLowerCase().split(':')[0].split('/')[0]
}

function replaceVchRoot(host: string, nextTld: 'com' | 'us') {
  if (host === VCH_ROOT_US || host.endsWith(`.${VCH_ROOT_US}`)) {
    return host.slice(0, -VCH_ROOT_US.length) + `veteranscentralhub.${nextTld}`
  }
  return host
}

export function mapVchHostnameUsToCom(hostname: string) {
  const host = normalizeHostname(hostname)
  if (host !== VCH_ROOT_US && !host.endsWith(`.${VCH_ROOT_US}`)) {
    return null
  }
  return replaceVchRoot(host, 'com')
}

export function buildVchComUrlFromParts(input: {
  protocol?: string
  hostname: string
  pathname?: string
  search?: string
  hash?: string
}) {
  const comHost = mapVchHostnameUsToCom(input.hostname)
  if (!comHost) return null

  const protocol = String(input.protocol || 'https:').replace(/:$/, '') + ':'
  const pathname = input.pathname && input.pathname.startsWith('/')
    ? input.pathname
    : `/${input.pathname || ''}`
  const search = input.search || ''
  const hash = input.hash || ''

  return `${protocol}//${comHost}${pathname}${search}${hash}`
}

export function buildVchComUrlFromLocation(locationLike: Location) {
  return buildVchComUrlFromParts({
    protocol: locationLike.protocol,
    hostname: locationLike.hostname,
    pathname: locationLike.pathname,
    search: locationLike.search,
    hash: locationLike.hash
  })
}
