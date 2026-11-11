import { fetchVaDecisionLetterIndex, REFRESH_VA_DECISION_LETTERS, type VaDecisionLetterRefreshResult } from './vaClaimLetters'
import { saveVaLettersCache } from './vaDeviceCache'
import { hasLocalDataConsent } from './privacyConsent'
import { isCurrentVaEpoch } from './vaAccount'

export async function refreshVaDecisionLetterCache(
  fetchPage?: Parameters<typeof fetchVaDecisionLetterIndex>[0],
  save = saveVaLettersCache,
  verifyEpoch = isCurrentVaEpoch
): Promise<VaDecisionLetterRefreshResult> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { rows, ownerEpoch } = await fetchVaDecisionLetterIndex(fetchPage)
      if (!ownerEpoch) return { ok: false, error: 'Sign in to VA.gov to save your claim letter list.' }
      if (!await hasLocalDataConsent()) return { ok: false, error: 'Enable VA data access in Data controls to refresh letters.' }
      const saved = await save(rows, ownerEpoch)
      if (!await hasLocalDataConsent()) return { ok: false, error: 'Enable VA data access in Data controls to refresh letters.' }
      if (await verifyEpoch(ownerEpoch)) return { ok: true, rows, ownerEpoch, saved }
    }
    return { ok: false, accountChanged: true, error: 'The active VA account could not be confirmed while saving the letter list.' }
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : ''
    return { ok: false, error: message || 'Could not read claim letters from VA.gov. Try again from your signed-in VA.gov tab.' }
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
