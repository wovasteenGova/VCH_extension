import { readHubAccessToken } from './hubSessionRead'

export const PRIVACY_CONSENT_KEY = 'vch-privacy-consent-v1'
export type CloudScope = 'track' | 'ratings' | 'letters'
type Consent = {
  localAcceptedAt?: string
  cloud?: Partial<Record<CloudScope, { accountId: string, acceptedAt: string }>>
  profileApprovals?: Record<string, string>
}

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

function hasProfileApproval(consent: Consent, accountId: string) {
  const approvedAt = Date.parse(consent.profileApprovals?.[accountId] ?? '')
  return Boolean(consent.localAcceptedAt && approvedAt > 0 && approvedAt <= Date.now())
}

export async function hasVaProfileCloudApproval(accountId: string) {
  try {
    return await currentHubAccountId() === accountId && hasProfileApproval(await readConsent(), accountId)
  } catch { return false }
}

export async function hasCloudConsent(scope: CloudScope, expectedAccountId?: string) {
  try {
    const consent = await readConsent()
    const accountId = await currentHubAccountId()
    if (!accountId || (expectedAccountId && accountId !== expectedAccountId)) return false
    if (hasProfileApproval(consent, accountId)) return true
    const grant = consent.cloud?.[scope]
    const age = grant ? Date.now() - Date.parse(grant.acceptedAt) : NaN
    return Boolean(consent.localAcceptedAt && grant?.accountId === accountId && age >= 0 && age < 30 * 24 * 60 * 60 * 1000)
  } catch { return false }
}

/** Called by the first explicitly approved VA Profile save for this account. */
export async function approveVaProfileCloudSave(expectedAccountId: string) {
  const accountId = await currentHubAccountId()
  const consent = await readConsent()
  if (!accountId || !consent.localAcceptedAt) throw new Error('Enable VA data access and sign in to VCH first.')
  if (expectedAccountId !== accountId) throw new Error('Your VCH account changed. Review the destination account and approve again.')
  if (hasProfileApproval(consent, accountId)) return
  await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: {
    ...consent, profileApprovals: { ...consent.profileApprovals, [accountId]: new Date().toISOString() }
  } })
}

export async function revokeCloudConsent() {
  const consent = await readConsent()
  await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: { ...consent, cloud: {}, profileApprovals: {} } })
}

export async function clearVaDataAndConsent() {
  // Revoke before removing data so an in-flight refresh cannot silently refill the cache.
  await browser.storage.local.remove(PRIVACY_CONSENT_KEY)
  const stored = await browser.storage.local.get(null)
  await browser.storage.local.remove(Object.keys(stored).filter(key => key.startsWith('vch-va-')))
  await browser.storage.session?.clear()
}
