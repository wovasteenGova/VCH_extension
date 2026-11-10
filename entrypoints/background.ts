import { consumeVaTrackClaimsIntent } from '@/shared/vaSignInNavigation'
import { applyVaCacheMutation, checkVaCacheEpoch, establishVaCacheOwner, readVaCachePageSummary, VA_CACHE_PAGE_SUMMARY, VA_CACHE_WRITE, VA_DEVICE_CACHE_STORAGE_KEY } from '@/shared/vaDeviceCache'
import { prepareVaSessionCache, readVaVaultStatus, VA_VAULT_SESSION_KEY } from '@/shared/vaLocalVault'
import { hasCloudConsent, hasLocalDataConsent, PRIVACY_CONSENT_KEY } from '@/shared/privacyConsent'
import { isClaimBuilderBridgeOrigin } from '@/shared/claimBuilderBridge'

import {
  VCH_PROBE_VA_SESSION,
  VCH_PROBE_VA_TRACK_CACHE
} from '@/shared/claimBuilderBridge'
import { probeVaSession } from '@/shared/connectionStatus'
import { readVaTrackBridgeCachePayload } from '@/shared/vaTrackBridgeCache'
import { autoSyncApprovedVaClaims } from '@/shared/vaProfileImport'
import { hubUrl, VCH_EXTENSION_HUB_PATH } from '@/shared/urls'
import { REFRESH_VA_DECISION_LETTERS, type VaDecisionLetterRefreshResult } from '@/shared/vaClaimLetters'
import { refreshVaDecisionLetterCache } from '@/shared/vaDecisionLetterSync'
import { vaFetch } from '@/shared/vaClient'
import { requestVa } from '@/shared/vaRequest'

export default defineBackground(() => {
  void prepareVaSessionCache().catch(() => undefined)
  let letterRefresh: Promise<VaDecisionLetterRefreshResult> | undefined
  function refreshDecisionLetters() {
    const accountStore = { establishOwner: establishVaCacheOwner, checkEpoch: checkVaCacheEpoch }
    return refreshVaDecisionLetterCache(
      url => vaFetch(url, address => requestVa(address, false, accountStore)),
      (rows, ownerEpoch) => applyVaCacheMutation({ field: 'letters', value: rows, ownerEpoch })
    )
  }

  let syncTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleApprovedClaimSync() {
    clearTimeout(syncTimer)
    // Claims and appeals often arrive as two writes from one VA refresh.
    syncTimer = setTimeout(() => { void autoSyncApprovedVaClaims().catch(() => undefined) }, 500)
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if ((area === 'local' && (VA_DEVICE_CACHE_STORAGE_KEY in changes || PRIVACY_CONSENT_KEY in changes))
      || (area === 'session' && (VA_DEVICE_CACHE_STORAGE_KEY in changes || changes[VA_VAULT_SESSION_KEY]?.newValue))) {
      scheduleApprovedClaimSync()
    }
  })

  browser.runtime.onInstalled.addListener((details) => {
    // Previous builds kept raw PDFs in local storage without an expiry.
    void browser.storage.local.remove('vch-va-pending-track-letters-v1')
    if (details.reason === 'install') {
      void browser.tabs.create({ url: hubUrl(VCH_EXTENSION_HUB_PATH) })
    }
  })

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return
    let origin = ''
    try { origin = sender.url ? new URL(sender.url).origin : '' } catch { return }
    const ownPage = sender.url?.startsWith(browser.runtime.getURL('/')) === true
    const vaPage = ['https://va.gov', 'https://www.va.gov'].includes(origin)
    const bridgePage = isClaimBuilderBridgeOrigin(origin) && sender.frameId === 0
    if (message?.type === REFRESH_VA_DECISION_LETTERS) {
      if (!ownPage) return
      // The popup can close while VA is responding. Keep the request and save here.
      letterRefresh ??= refreshDecisionLetters().finally(() => { letterRefresh = undefined })
      void letterRefresh.then(sendResponse)
      return true
    }
    if (message?.type === VA_CACHE_PAGE_SUMMARY) {
      if (!vaPage || sender.frameId !== 0) return
      void readVaCachePageSummary().then(sendResponse, () => sendResponse(null))
      return true
    }
    if (message?.type === 'VCH_SYNC_APPROVED_VA_TRACK') {
      if (!ownPage) return
      scheduleApprovedClaimSync()
      sendResponse({ ok: true })
      return
    }
    if (message?.type === 'VCH_VA_ACCOUNT' || message?.type === 'VCH_VA_ACCOUNT_CHECK') {
      if (!ownPage && !vaPage) return
      if (message.type === 'VCH_VA_ACCOUNT_CHECK') {
        void checkVaCacheEpoch(message.epoch).then(ok => sendResponse({ ok }))
      } else {
        void establishVaCacheOwner(typeof message.accountId === 'string' ? message.accountId : '').then(epoch => sendResponse({ ok: Boolean(epoch), epoch }))
      }
      return true
    }
    if (message?.type === 'VCH_CONSUME_VA_INTENT') {
      if (!vaPage || sender.frameId !== 0) return
      void consumeVaTrackClaimsIntent().then(redirect => sendResponse({ redirect }))
      return true
    }
    if (message?.type === VA_CACHE_WRITE) {
      if (!ownPage && !vaPage) return
      void applyVaCacheMutation(message.mutation ?? {}).then(ok => sendResponse({ ok }))
      return true
    }
    if (message?.type === 'PING') {
      sendResponse({ ok: true })
      return
    }

    if (message?.type === VCH_PROBE_VA_SESSION) {
      if (!ownPage && !bridgePage) return
      void (async () => {
        try {
          if (!await hasLocalDataConsent()) { sendResponse({ connected: false, label: 'Enable VA access in the VCH extension' }); return }
          if (await readVaVaultStatus() === 'locked') { sendResponse({ connected: false, label: 'Unlock VA data in the VCH extension' }); return }
          sendResponse(await probeVaSession())
        } catch {
          sendResponse({ connected: false, label: 'Sign in to VA.gov' })
        }
      })()
      return true
    }

    if (message?.type === VCH_PROBE_VA_TRACK_CACHE) {
      if (!ownPage && !bridgePage) return
      void (async () => {
        try {
          if (typeof message.accountId !== 'string' || !message.accountId || !await hasCloudConsent('track', message.accountId)) {
            sendResponse({ ok: false, error: 'Use Save VA data to your VCH account in the extension’s VA Profile tab first.' })
            return
          }
          sendResponse(await readVaTrackBridgeCachePayload())
        } catch {
          sendResponse({
            ok: true,
            claims: [],
            appeals: [],
            deviceLastSyncedAt: null,
            vaLabel: null
          })
        }
      })()
      return true
    }

    if (message?.type === 'OPEN_EXTENSION_POPUP') {
      if (!ownPage && !vaPage && !bridgePage) return
      void (async () => {
        try {
          if (browser.action?.openPopup) {
            await browser.action.openPopup()
            sendResponse({ ok: true })
            return
          }
        } catch {
          /* fall through: openPopup needs a recent user gesture in some builds */
        }
        sendResponse({
          ok: false,
          hint: 'Click the VCH Web Extension icon in your browser toolbar.'
        })
      })()
      return true
    }
  })
})
