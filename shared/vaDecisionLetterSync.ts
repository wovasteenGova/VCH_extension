import { fetchVaDecisionLetterIndex, REFRESH_VA_DECISION_LETTERS, type VaDecisionLetterRefreshResult } from './vaClaimLetters'
import { checkVaCacheEpoch, saveVaLettersCache } from './vaDeviceCache'
import { hasLocalDataConsent } from './privacyConsent'

export async function refreshVaDecisionLetterCache(
  fetchPage?: Parameters<typeof fetchVaDecisionLetterIndex>[0],
  save = saveVaLettersCache
): Promise<VaDecisionLetterRefreshResult> {
  try {
    const { rows, ownerEpoch } = await fetchVaDecisionLetterIndex(fetchPage)
    if (!ownerEpoch) return { ok: false, error: 'Sign in to VA.gov to save your decision letter list.' }

    const saved = await save(rows, ownerEpoch)
    if (!await hasLocalDataConsent() || !await checkVaCacheEpoch(ownerEpoch)) {
      return { ok: false, error: 'Your VA.gov access changed. Refresh the letter list and try again.' }
    }
    return { ok: true, rows, ownerEpoch, saved }
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : ''
    return { ok: false, error: message || 'Could not read decision letters from VA.gov. Try again from your signed-in VA.gov tab.' }
  }
}

export async function requestVaDecisionLetterRefresh(): Promise<VaDecisionLetterRefreshResult> {
  try {
    const result: VaDecisionLetterRefreshResult | undefined = await browser.runtime.sendMessage({ type: REFRESH_VA_DECISION_LETTERS })
    if (result?.ok === true || (result?.ok === false && result.error)) return result
  } catch {
    // A background context may be unavailable during an extension reload.
  }

  return refreshVaDecisionLetterCache()
}
