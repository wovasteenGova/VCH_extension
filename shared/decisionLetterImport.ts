import { CLAIMBUILDER_URL } from './urls'
import { readHubAccessToken } from './hubSessionRead'
import { hasCloudConsent } from './privacyConsent'
import { downloadVaDecisionLetter, type VaLetterIndexRow } from './vaClaimLetters'

export function decisionLetterFilename(row: VaLetterIndexRow) {
  const date = (row.letterDate ?? row.documentDate ?? row.receivedAt ?? '').slice(0, 10).replace(/[^0-9-]/g, '')
  const id = (row.documentUuid ?? row.documentId ?? row.id ?? 'letter').replace(/[^a-z0-9-]/gi, '').slice(0, 80)
  return `VA-decision${date ? `-${date}` : ''}-${id}.pdf`
}

/** Import to the private library without guessing an association with a claim. */
export async function sendDecisionLetterToVch(row: VaLetterIndexRow) {
  if (!await hasCloudConsent('letters')) throw new Error('Confirm sending decision letters to your VCH account first.')
  const token = await readHubAccessToken()
  if (!token) throw new Error('Sign in to VCH in this browser, then try again.')
  const base64 = await downloadVaDecisionLetter(row)
  // Re-check after the VA download in case the account or consent changed meanwhile.
  if (!await hasCloudConsent('letters') || token !== await readHubAccessToken()) throw new Error('Your VCH session changed. Confirm the destination account and try again.')
  const data = atob(base64)
  const bytes = Uint8Array.from(data, char => char.charCodeAt(0))
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), decisionLetterFilename(row))
  form.append('documentTypeHint', 'va_decision')
  form.append('uploadPurpose', 'library')
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
