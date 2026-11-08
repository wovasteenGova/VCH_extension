import { readHubAccessToken } from './hubSessionRead'

export const PRIVACY_CONSENT_KEY = 'vch-privacy-consent-v1'
export type CloudScope = 'track' | 'ratings' | 'letters'
type Consent = { localAcceptedAt?: string, cloud?: Partial<Record<CloudScope, { accountId: string, acceptedAt: string }>> }

async function readConsent(): Promise<Consent> {
  const stored = await browser.storage.local.get(PRIVACY_CONSENT_KEY)
  const value = stored[PRIVACY_CONSENT_KEY]
  return value && typeof value === 'object' ? value as Consent : {}
}

export async function hasLocalDataConsent() {
  try { return Boolean((await readConsent()).localAcceptedAt) } catch { return false }
}

export async function acceptLocalDataAccess() {
  const current = await readConsent()
  await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: { ...current, localAcceptedAt: new Date().toISOString() } })
}

// This is an account binding, not authentication. VCH verifies the token on every import.
async function currentHubAccountId() {
  const token = await readHubAccessToken()
  if (!token) return null
  try {
    const segment = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')))
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch { return null }
}

export async function hasCloudConsent(scope: CloudScope) {
  try {
    const consent = await readConsent()
    const grant = consent.cloud?.[scope]
    const accountId = grant ? await currentHubAccountId() : null
    const age = grant ? Date.now() - Date.parse(grant.acceptedAt) : NaN
    return Boolean(consent.localAcceptedAt && accountId && grant?.accountId === accountId && age >= 0 && age < 30 * 24 * 60 * 60 * 1000)
  } catch { return false }
}

/** Call only from an explicit confirmation control in extension UI. */
export async function grantCloudConsent(scope: CloudScope) {
  return grantCloudConsents([scope])
}

/** One user approval can cover all data categories included in the same save. */
export async function grantCloudConsents(scopes: CloudScope[], expectedAccountId?: string) {
  const accountId = await currentHubAccountId()
  const consent = await readConsent()
  if (!accountId || !consent.localAcceptedAt) throw new Error('Enable VA data access and sign in to VCH first.')
  if (expectedAccountId && expectedAccountId !== accountId) throw new Error('Your VCH account changed. Review the destination account and approve again.')
  const acceptedAt = new Date().toISOString()
  const cloud = { ...consent.cloud }
  for (const scope of scopes) cloud[scope] = { accountId, acceptedAt }
  await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: {
    ...consent, cloud
  } })
}

export async function revokeCloudConsent() {
  const consent = await readConsent()
  await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: { ...consent, cloud: {} } })
}

export async function clearVaDataAndConsent() {
  // Revoke before removing data so an in-flight refresh cannot silently refill the cache.
  await browser.storage.local.remove(PRIVACY_CONSENT_KEY)
  const stored = await browser.storage.local.get(null)
  await browser.storage.local.remove(Object.keys(stored).filter(key => key.startsWith('vch-va-')))
  await browser.storage.session?.clear()
}
