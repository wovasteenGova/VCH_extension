import type { ConnectionState } from './connectionStatus'
import { HUB_COOKIE_DOMAINS, hubOriginFromCookieDomain } from './hubOrigins'

export type HubCookieProbe = ConnectionState & {
  hubOrigin?: string
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

function assembleAuthCookieValue(cookies: browser.cookies.Cookie[]): string | null {
  const authCookies = cookies
    .filter((cookie) => /^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  if (!authCookies.length) return null

  const combined = authCookies.map((cookie) => cookie.value).join('')
  return combined || null
}

function resolveHubOriginFromAuthCookies(cookies: browser.cookies.Cookie[]): string | undefined {
  for (const cookie of cookies) {
    if (!/^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name)) continue
    const origin = hubOriginFromCookieDomain(cookie.domain)
    if (origin) return origin
  }
  return undefined
}

function sessionStateFromValue(
  sessionValue: string,
  hubOrigin?: string
): HubCookieProbe | null {
  let decoded = sessionValue
  try {
    decoded = decodeURIComponent(sessionValue)
  } catch {
    decoded = sessionValue
  }

  const session = parseSupabaseSessionValue(decoded)
  if (!session) return null

  const accessToken = typeof session.access_token === 'string' ? session.access_token : null
  const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : null
  if (expiresAt && expiresAt * 1000 < Date.now()) {
    return {
      connected: false,
      label: 'Sign in to Hub',
      hubOrigin
    }
  }

  if (accessToken) {
    const jwt = decodeJwtPayload(accessToken)
    if (jwt) {
      return {
        connected: true,
        label: readDisplayName(jwt) || 'Signed in',
        hubOrigin
      }
    }
  }

  const user = session.user
  if (user && typeof user === 'object') {
    const name = readDisplayName(user as Record<string, unknown>)
    if (name) {
      return {
        connected: true,
        label: name,
        hubOrigin
      }
    }
  }

  return {
    connected: true,
    label: 'Signed in',
    hubOrigin
  }
}

export async function probeHubSessionFromCookies(): Promise<HubCookieProbe | null> {
  if (!browser.cookies?.getAll) return null

  const seen = new Set<string>()
  const cookies: browser.cookies.Cookie[] = []

  for (const domain of HUB_COOKIE_DOMAINS) {
    const batch = await browser.cookies.getAll({ domain })
    for (const cookie of batch) {
      const key = `${cookie.name}|${cookie.domain}|${cookie.path}`
      if (seen.has(key)) continue
      seen.add(key)
      cookies.push(cookie)
    }
  }

  const sessionValue = assembleAuthCookieValue(cookies)
  if (!sessionValue) return null

  const hubOrigin = resolveHubOriginFromAuthCookies(cookies)
  return sessionStateFromValue(sessionValue, hubOrigin)
}
