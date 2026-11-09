import { readHubAccessToken } from './hubSessionRead'

export const PRIVACY_CONSENT_KEY = 'vch-privacy-consent-v1'
export type CloudScope = 'track' | 'ratings' | 'letters'
export type VaProfileCloudApproval = { acceptedAt: string, autoSyncTrack: boolean }
type Consent = {
  localAcceptedAt?: string
  cloud?: Partial<Record<CloudScope, { accountId: string, acceptedAt: string }>>
  profileApprovals?: Record<string, string | VaProfileCloudApproval>
}

async function readConsent(): Promise<Consent> {
  const stored = await browser.storage.local.get(PRIVACY_CONSENT_KEY)
  const value = stored[PRIVACY_CONSENT_KEY]
  return value && typeof value === 'object' ? value as Consent : {}
}

function withConsentWrite<T>(write: () => Promise<T>) {
  return globalThis.navigator?.locks?.request('vch-va-consent', write) ?? write()
}

export async function hasLocalDataConsent() {
  try { return Boolean((await readConsent()).localAcceptedAt) } catch { return false }
}

export function acceptLocalDataAccess() {
  return withConsentWrite(async () => {
    const current = await readConsent()
    await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: { ...current, localAcceptedAt: new Date().toISOString() } })
  })
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

function profileApproval(consent: Consent, accountId: string): VaProfileCloudApproval | null {
  const stored = consent.profileApprovals?.[accountId]
  // The old approval covered manual saves. Retain it without enabling auto-sync.
  const acceptedAt = typeof stored === 'string' ? stored : stored?.acceptedAt
  const time = Date.parse(acceptedAt ?? '')
  if (!consent.localAcceptedAt || !acceptedAt || !(time > 0 && time <= Date.now())) return null
  return { acceptedAt, autoSyncTrack: typeof stored === 'object' && stored.autoSyncTrack === true }
}

export async function readVaProfileCloudApproval(accountId: string) {
  try {
    if (await currentHubAccountId() === accountId) return profileApproval(await readConsent(), accountId)
  } catch { /* No valid signed-in approval. */ }
  return null
}

export async function hasVaProfileCloudApproval(accountId: string) {
  return Boolean(await readVaProfileCloudApproval(accountId))
}

export async function hasCloudConsent(scope: CloudScope, expectedAccountId?: string) {
  try {
    const consent = await readConsent()
    const accountId = await currentHubAccountId()
    if (!accountId || (expectedAccountId && accountId !== expectedAccountId)) return false
    if (profileApproval(consent, accountId)) return true
    const grant = consent.cloud?.[scope]
    const age = grant ? Date.now() - Date.parse(grant.acceptedAt) : NaN
    return Boolean(consent.localAcceptedAt && grant?.accountId === accountId && age >= 0 && age < 30 * 24 * 60 * 60 * 1000)
  } catch { return false }
}

function updateAccountApproval(
  expectedAccountId: string,
  update: (consent: Consent) => Consent
) {
  return withConsentWrite(async () => {
    const accountId = await currentHubAccountId()
    const consent = await readConsent()
    if (!accountId || !consent.localAcceptedAt) throw new Error('Enable VA data access and sign in to VCH first.')
    if (expectedAccountId !== accountId) throw new Error('Your VCH account changed. Review the destination account and approve again.')
    const next = update(consent)
    if (next !== consent) await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: next })
  })
}

/** Called only when the user clicks Approve sync in VA Profile. */
export function approveVaProfileCloudSave(accountId: string, autoSyncTrack: boolean) {
  return updateAccountApproval(accountId, consent => {
    if (profileApproval(consent, accountId)) return consent
    return {
      ...consent,
      profileApprovals: {
        ...consent.profileApprovals,
        [accountId]: { acceptedAt: new Date().toISOString(), autoSyncTrack }
      }
    }
  })
}

export function setVaProfileTrackAutoSync(accountId: string, autoSyncTrack: boolean) {
  return updateAccountApproval(accountId, consent => {
    const approval = profileApproval(consent, accountId)
    if (!approval) throw new Error('Approve sync for this account first.')
    if (approval.autoSyncTrack === autoSyncTrack) return consent
    return { ...consent, profileApprovals: { ...consent.profileApprovals, [accountId]: { ...approval, autoSyncTrack } } }
  })
}

export function revokeVaProfileCloudApproval(accountId: string) {
  return updateAccountApproval(accountId, consent => {
    const profileApprovals = { ...consent.profileApprovals }
    delete profileApprovals[accountId]
    const cloud = { ...consent.cloud }
    for (const scope of ['track', 'ratings', 'letters'] as const) {
      if (cloud[scope]?.accountId === accountId) delete cloud[scope]
    }
    return { ...consent, profileApprovals, cloud }
  })
}

export function revokeCloudConsent() {
  return withConsentWrite(async () => {
    const consent = await readConsent()
    await browser.storage.local.set({ [PRIVACY_CONSENT_KEY]: { ...consent, cloud: {}, profileApprovals: {} } })
  })
}

export function clearVaDataAndConsent() {
  return withConsentWrite(async () => {
    // Revoke before removing data so an in-flight refresh cannot silently refill the cache.
    await browser.storage.local.remove(PRIVACY_CONSENT_KEY)
    const stored = await browser.storage.local.get(null)
    await browser.storage.local.remove(Object.keys(stored).filter(key => key.startsWith('vch-va-')))
    await browser.storage.session?.clear()
  })
}
