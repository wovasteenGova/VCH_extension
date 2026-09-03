import { DEFAULT_HUB_ORIGIN, hubOriginFromCookieDomain } from './hubOrigins'

export type HubSessionRead = {
  connected: boolean
  canImport: boolean
  label: string
  accessToken: string | null
  hubOrigin: string
}

type ParsedAuthSession = {
  accessToken: string
  expiresAt: number | null
  hubOrigin: string
  preferCom: boolean
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1]
  if (!segment) return null
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function readDisplayName(payload: Record<string, unknown>): string | null {
  const metadata = payload.user_metadata
  if (metadata && typeof metadata === 'object') {
    const meta = metadata as Record<string, unknown>
    if (typeof meta.full_name === 'string' && meta.full_name) return meta.full_name
    const first = typeof meta.first_name === 'string' ? meta.first_name : ''
    const last = typeof meta.last_name === 'string' ? meta.last_name : ''
    const combined = [first, last].filter(Boolean).join(' ')
    if (combined) return combined
  }
  if (typeof payload.email === 'string' && payload.email) {
    const email = payload.email
    const local = email.split('@')[0]
    return local || email
  }
  return null
}

function parseSupabaseSessionValue(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const candidates = [trimmed]
  if (trimmed.startsWith('base64-')) {
    try {
      candidates.push(atob(trimmed.slice('base64-'.length)))
    } catch {
      /* ignore */
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      /* try next */
    }
  }

  return null
}

function decodeCookieSessionValue(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function sessionIsExpired(accessToken: string, expiresAt: number | null) {
  const now = Date.now()
  if (typeof expiresAt === 'number' && expiresAt * 1000 < now) return true

  const payload = decodeJwtPayload(accessToken)
  const jwtExp = payload && typeof payload.exp === 'number' ? payload.exp : null
  if (typeof jwtExp === 'number' && jwtExp * 1000 < now) return true

  return false
}

/** Prefer .com auth cookies when multiple valid sessions exist. */
export function pickHubAuthCookies(cookies: browser.cookies.Cookie[]) {
  const authCookies = cookies.filter(cookie =>
    /^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name)
  )

  const comCookies = authCookies.filter(cookie => cookie.domain.includes('.com'))
  const pool = comCookies.length
    ? comCookies
    : authCookies.filter(cookie => cookie.domain.includes('.us'))

  return pool.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function groupAuthCookieSets(cookies: browser.cookies.Cookie[]) {
  const groups = new Map<string, browser.cookies.Cookie[]>()

  for (const cookie of cookies) {
    if (!/^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name)) continue
    const baseName = cookie.name.replace(/\.\d+$/, '')
    const key = `${cookie.domain}|${baseName}`
    const list = groups.get(key) ?? []
    list.push(cookie)
    groups.set(key, list)
  }

  return [...groups.values()].map(group =>
    group.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  )
}

function parseAuthSessionFromCookieSet(cookies: browser.cookies.Cookie[]): ParsedAuthSession | null {
  if (!cookies.length) return null

  const sessionValue = cookies.map(cookie => cookie.value).join('')
  if (!sessionValue) return null

  const session = parseSupabaseSessionValue(decodeCookieSessionValue(sessionValue))
  if (!session) return null

  const accessToken = typeof session.access_token === 'string' ? session.access_token : null
  if (!accessToken) return null

  const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : null
  if (sessionIsExpired(accessToken, expiresAt)) return null

  const domain = cookies[0]?.domain ?? ''
  const hubOrigin = hubOriginFromCookieDomain(domain) ?? DEFAULT_HUB_ORIGIN

  return {
    accessToken,
    expiresAt,
    hubOrigin,
    preferCom: domain.includes('.com')
  }
}

function pickBestAuthSession(cookies: browser.cookies.Cookie[]): ParsedAuthSession | null {
  const candidates = groupAuthCookieSets(cookies)
    .map(parseAuthSessionFromCookieSet)
    .filter((session): session is ParsedAuthSession => session != null)

  if (!candidates.length) return null

  candidates.sort((a, b) => {
    if (a.preferCom !== b.preferCom) return a.preferCom ? -1 : 1
    const aExp = a.expiresAt ?? 0
    const bExp = b.expiresAt ?? 0
    return bExp - aExp
  })

  return candidates[0] ?? null
}

export async function readHubAuthCookies() {
  if (!browser.cookies?.getAll) return []

  const seen = new Set<string>()
  const cookies: browser.cookies.Cookie[] = []
  const domains = [
    'veteranscentralhub.com',
    '.veteranscentralhub.com',
    'www.veteranscentralhub.com',
    'claimbuilder.veteranscentralhub.com',
    '.claimbuilder.veteranscentralhub.com',
    'veteranscentralhub.us',
    '.veteranscentralhub.us',
    'www.veteranscentralhub.us'
  ]

  for (const domain of domains) {
    const batch = await browser.cookies.getAll({ domain })
    for (const cookie of batch) {
      const key = `${cookie.name}|${cookie.domain}|${cookie.path}`
      if (seen.has(key)) continue
      seen.add(key)
      cookies.push(cookie)
    }
  }

  return cookies
}

export async function readHubSession(): Promise<HubSessionRead> {
  const cookies = await readHubAuthCookies()
  const session = pickBestAuthSession(cookies)

  if (!session) {
    const hadAuthCookies = cookies.some(cookie =>
      /^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name)
    )

    return {
      connected: false,
      canImport: false,
      label: hadAuthCookies ? 'Hub session expired' : 'Sign in to Hub',
      accessToken: null,
      hubOrigin: DEFAULT_HUB_ORIGIN
    }
  }

  const jwt = decodeJwtPayload(session.accessToken)
  const label = jwt ? (readDisplayName(jwt) || 'Signed in') : 'Signed in'

  return {
    connected: true,
    canImport: true,
    label,
    accessToken: session.accessToken,
    hubOrigin: session.hubOrigin
  }
}

export async function readHubAccessToken() {
  const session = await readHubSession()
  return session.accessToken
}
