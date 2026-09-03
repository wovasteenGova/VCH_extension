import { VA_SIGN_IN_PAGE, VA_TRACK_CLAIMS_PAGE } from './vaEndpoints'

const INTENT_KEY = 'vch_va_track_claims_intent'
const INTENT_TTL_MS = 30 * 60 * 1000

type VaTrackClaimsIntent = {
  at: number
}

export async function markVaTrackClaimsIntent() {
  await browser.storage.session.set({
    [INTENT_KEY]: { at: Date.now() } satisfies VaTrackClaimsIntent
  })
}

export async function consumeVaTrackClaimsIntent() {
  const stored = await browser.storage.session.get(INTENT_KEY)
  const record = stored[INTENT_KEY] as VaTrackClaimsIntent | undefined
  if (!record || typeof record.at !== 'number') return false

  await browser.storage.session.remove(INTENT_KEY)

  if (Date.now() - record.at > INTENT_TTL_MS) return false
  return true
}

/** Open track-claims and remember intent so My VA post-login can bounce back here. */
export function openVaSignIn() {
  void markVaTrackClaimsIntent()
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

export function openVaClaimsPage() {
  void markVaTrackClaimsIntent()
  void browser.tabs.create({ url: VA_TRACK_CLAIMS_PAGE })
}
