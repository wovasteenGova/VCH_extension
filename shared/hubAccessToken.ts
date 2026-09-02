import { HUB_COOKIE_DOMAINS } from './hubOrigins'

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

function assembleAuthCookieValue(cookies: browser.cookies.Cookie[]) {
  const authCookies = cookies
    .filter(cookie => /^sb-[\w-]+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  if (!authCookies.length) return null
  return authCookies.map(cookie => cookie.value).join('') || null
}

/** Hub Supabase access token for authenticated ClaimBuilder API calls. */
export async function readHubAccessToken() {
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
  if (expiresAt && expiresAt * 1000 < Date.now()) return null

  return accessToken
}
