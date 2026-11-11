import { CLAIMBUILDER_URL } from './urls'
import { readHubAccessToken, readHubSession } from './hubSessionRead'
import { hasCloudConsent, hasLocalDataConsent } from './privacyConsent'
import { decisionLetterKey, downloadVaDecisionLetter, type VaLetterIndexRow } from './vaClaimLetters'
import { readVaVaultRecord, withVaVaultLock, writeVaVaultRecord } from './vaLocalVault'

const IMPORT_STATUS_CACHE_PREFIX = 'vch-va-letter-status:'

export async function readImportedDecisionLetterKeys(accountId: string): Promise<string[] | null> {
  const key = IMPORT_STATUS_CACHE_PREFIX + accountId
  const values = await readVaVaultRecord<unknown>(key).catch(() => undefined)
  return Array.isArray(values) && values.every(value => typeof value === 'string') ? values : null
}

export async function cacheImportedDecisionLetterKeys(accountId: string, keys: string[]) {
  await withVaVaultLock(async () => {
    if (await hasLocalDataConsent()) await writeVaVaultRecord(IMPORT_STATUS_CACHE_PREFIX + accountId, keys)
  }).catch(() => undefined)
}

export async function fetchImportedDecisionLetterKeys(accountId: string): Promise<string[]> {
  const session = await readHubSession()
  if (!session.accessToken || session.accountId !== accountId) throw new Error('Sign in to check imported letters.')
  const response = await fetch(`${CLAIMBUILDER_URL}/api/documents/va-decision-letters`, {
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' }
  })
  if (!response.ok) throw new Error('Could not check imported letters.')
  const data = await response.json()
  if (!Array.isArray(data?.letterKeys) || !data.letterKeys.every((key: unknown) => typeof key === 'string')) {
    throw new Error('VCH did not return letter import status.')
  }
  return data.letterKeys
}

export function decisionLetterFilename(row: VaLetterIndexRow) {
  const date = (row.letterDate ?? row.documentDate ?? row.receivedAt ?? '').slice(0, 10).replace(/[^0-9-]/g, '')
  const id = (row.documentUuid ?? row.documentId ?? row.id ?? 'letter').replace(/[^a-z0-9-]/gi, '').slice(0, 80)
  return `VA-letter${date ? `-${date}` : ''}-${id}.pdf`
}

/** Import to the private library without guessing an association with a claim. */
export async function sendDecisionLetterToVch(row: VaLetterIndexRow, accountId: string) {
  const { accessToken: token, accountId: currentAccountId } = await readHubSession()
  if (!token || currentAccountId !== accountId || !await hasCloudConsent('letters', accountId)) {
    throw new Error('Confirm saving VA data to your VCH account first.')
  }
  const base64 = await downloadVaDecisionLetter(row)
  // Re-check after the VA download in case the account or consent changed meanwhile.
  if (!await hasCloudConsent('letters', accountId) || token !== await readHubAccessToken()) throw new Error('Your VCH session changed. Confirm the destination account and try again.')
  const data = atob(base64)
  const bytes = Uint8Array.from(data, char => char.charCodeAt(0))
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), decisionLetterFilename(row))
  form.append('documentTypeHint', 'va_decision')
  form.append('uploadPurpose', 'library')
  form.append('vaDecisionLetterKey', decisionLetterKey(row))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await fetch(`${CLAIMBUILDER_URL}/api/documents/upload`, {
      method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.document?.id) {
      throw new Error(response.status === 401 ? 'Your VCH sign-in expired. Sign in and try again.' : body?.message ?? body?.statusMessage ?? `VCH could not save this letter (${response.status}).`)
    }
    return { documentId: body.document.id as string, duplicate: body.duplicate === true }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('VCH did not confirm the import in time. Check your library before retrying; identical PDFs are deduplicated.')
    throw error
  } finally { clearTimeout(timeout) }
}
