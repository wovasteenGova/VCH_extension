import hubLogo from '../public/icon-48.png?inline'
import { hasLocalDataConsent } from '@/shared/privacyConsent'
import { formatLastSynced, requestVaCachePageSummary } from '@/shared/vaDeviceCache'
import {
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextValid,
  safeExtensionRuntimeMessage
} from '@/shared/extensionContext'
import { isVaMyVaPathname, VA_TRACK_CLAIMS_BAR_MATCHES, VA_TRACK_CLAIMS_PAGE } from '@/shared/vaEndpoints'
import { probeVaSessionOnCurrentPage } from '@/shared/vaInPageFetch'
import { syncClaimsFromVaPage } from '@/shared/vaPageClaimsSync'
import {
  readTrackClaimsBarCollapsed,
  writeTrackClaimsBarCollapsed
} from '@/shared/vaTrackClaimsBarPrefs'

const BAR_HOST_ID = 'vch-web-ext-track-claims-bar'

function isVaYourClaimsPage(pathname: string) {
  return pathname === '/track-claims/your-claims' || pathname.startsWith('/track-claims/your-claims/')
}

/** VA often needs a few seconds after navigation before claims APIs authorize. */
const AUTO_SYNC_DELAYS_MS = [1200, 3000, 6000, 12_000, 20_000]

const BAR_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: auto 0 0 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.shell {
  pointer-events: auto;
  box-sizing: border-box;
  margin: 0 auto max(12px, env(safe-area-inset-bottom));
  width: min(28rem, calc(100vw - 24px));
  border-radius: 14px;
  border: 1px solid rgba(201, 162, 39, 0.45);
  background: linear-gradient(180deg, #1a1f2b 0%, #12151c 100%);
  color: #f3f4f6;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.shell.collapsed {
  width: auto;
  margin-right: 12px;
  margin-left: auto;
  border-radius: 999px;
}
.header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 4px;
}
.logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}
.title-wrap {
  min-width: 0;
  flex: 1;
}
.title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  color: #fff;
}
.subtitle {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.35;
  color: #9ca3af;
}
.toolbar {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
}
.toolbar .btn,
.va-nav .btn {
  flex: 1;
  min-width: 0;
}
.va-nav {
  padding: 0 12px 8px;
}
.va-nav .btn {
  width: 100%;
}
.btn {
  appearance: none;
  border: 0;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.2;
}
.btn-primary {
  background: rgba(201, 162, 39, 0.22);
  color: #f5e6a8;
  border: 1px solid rgba(201, 162, 39, 0.45);
}
.btn-primary:hover {
  background: rgba(201, 162, 39, 0.32);
}
.btn-ghost {
  background: transparent;
  color: #d1d5db;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}
.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 14px;
}
.body {
  padding: 0 0 10px;
}
.body .subtitle {
  margin: 0;
  padding: 0 12px;
  line-height: 1.4;
}
.status-ok { color: #86efac; }
.status-warn { color: #fcd34d; }
.status-error { color: #fca5a5; }
.collapsed .body,
.collapsed .toolbar,
.collapsed .va-nav,
.collapsed .title-wrap .subtitle {
  display: none;
}
.collapsed .header {
  padding: 8px 10px;
  cursor: pointer;
  align-items: center;
}
.collapsed [data-role="collapse"] {
  margin-left: 0;
}
`

export default defineContentScript({
  matches: [...VA_TRACK_CLAIMS_BAR_MATCHES],
  runAt: 'document_idle',
  main(ctx) {
    const onMyVa = isVaMyVaPathname(window.location.pathname)
    document.getElementById(BAR_HOST_ID)?.remove()

    const host = document.createElement('div')
    host.id = BAR_HOST_ID
    const shadow = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = BAR_STYLES
    shadow.appendChild(style)

    const shell = document.createElement('div')
    shell.className = 'shell'
    shell.innerHTML = `
      <div class="header">
        <img class="logo" src="${hubLogo}" alt="">
        <div class="title-wrap">
          <p class="title">VCH Web Extension</p>
          <p class="subtitle" data-role="subtitle">Checking your claims…</p>
        </div>
        <button type="button" class="btn btn-ghost icon-btn" data-role="collapse" aria-label="Collapse">−</button>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-role="sync">Sync</button>
        <button type="button" class="btn btn-ghost" data-role="open-ext">Open extension</button>
      </div>
      <div class="va-nav" data-role="va-nav">
        <button type="button" class="btn btn-ghost" data-role="claims-link">Go to Track claims</button>
      </div>
      <div class="body">
        <p class="subtitle" data-role="detail">Open Track claims on VA.gov, then Sync saves claims, appeals, ratings, and your letter list on this device.</p>
      </div>
    `
    shadow.appendChild(shell)
    document.body.appendChild(host)

    const subtitleEl = shell.querySelector('[data-role="subtitle"]') as HTMLElement
    const detailEl = shell.querySelector('[data-role="detail"]') as HTMLElement
    const syncBtn = shell.querySelector('[data-role="sync"]') as HTMLButtonElement
    const openBtn = shell.querySelector('[data-role="open-ext"]') as HTMLButtonElement
    const claimsLinkBtn = shell.querySelector('[data-role="claims-link"]') as HTMLButtonElement
    const vaNavEl = shell.querySelector('[data-role="va-nav"]') as HTMLElement
    const collapseBtn = shell.querySelector('[data-role="collapse"]') as HTMLButtonElement
    if (isVaYourClaimsPage(window.location.pathname)) vaNavEl.hidden = true

    let syncing = false
    let autoSyncSucceeded = false
    let autoSyncGeneration = 0
    let contextStale = !isExtensionContextValid()

    function showStaleExtensionContext() {
      contextStale = true
      subtitleEl.textContent = 'Extension updated'
      subtitleEl.className = 'subtitle status-warn'
      detailEl.textContent = EXTENSION_CONTEXT_INVALIDATED_MESSAGE
      syncBtn.disabled = true
      openBtn.textContent = 'Refresh page'
    }

    async function applyCollapsed(collapsed: boolean) {
      if (contextStale) {
        shell.classList.toggle('collapsed', collapsed)
        collapseBtn.textContent = collapsed ? '+' : '−'
        return
      }
      shell.classList.toggle('collapsed', collapsed)
      collapseBtn.textContent = collapsed ? '+' : '−'
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse')
      await writeTrackClaimsBarCollapsed(collapsed)
    }

    async function refreshStatusMessage() {
      if (contextStale || !isExtensionContextValid()) {
        showStaleExtensionContext()
        return
      }

      if (!await hasLocalDataConsent()) {
        subtitleEl.textContent = 'VA data access is off'
        subtitleEl.className = 'subtitle status-warn'
        detailEl.textContent = 'Open the VCH extension to enable VA data access.'
        return
      }
      const meta = await requestVaCachePageSummary()
      if (meta && !meta.available) {
        subtitleEl.textContent = 'Unlock VA data in the VCH extension'
        subtitleEl.className = 'subtitle status-warn'
        detailEl.textContent = 'Open the extension and enter your passphrase to use saved claims or sync.'
        return
      }
      const synced = formatLastSynced(meta?.lastSyncedAt)
      if (meta?.count) {
        subtitleEl.textContent = synced
          ? `Claims saved on this device · Last synced ${synced}`
          : 'Claims saved on this device'
        subtitleEl.className = 'subtitle status-ok'
        detailEl.textContent = 'Open the extension for imports and ClaimBuilder tools.'
        return
      }
      const session = await probeVaSessionOnCurrentPage()
      if (session === 'signed_in') {
        subtitleEl.textContent = 'Signed in to VA.gov'
        subtitleEl.className = 'subtitle status-ok'
        detailEl.textContent = syncing
          ? 'Syncing claims on this device…'
          : 'Sync runs automatically on this page.'
        return
      }
      if (session === 'signed_out') {
        subtitleEl.textContent = 'Sign in to VA.gov to save claims'
        subtitleEl.className = 'subtitle status-warn'
        detailEl.textContent = onMyVa
          ? 'Use Sign in above on this page. Sync runs automatically after you sign in, or open Track claims.'
          : 'Sign in on VA.gov in this browser. Sync runs automatically when claims load.'
        return
      }
      subtitleEl.textContent = 'Checking VA sign-in…'
      subtitleEl.className = 'subtitle'
      detailEl.textContent = 'If you are signed in, wait a moment or tap Sync.'
    }

    async function runSync(automatic = false): Promise<boolean> {
      if (syncing || contextStale || !isExtensionContextValid()) {
        if (!contextStale && !isExtensionContextValid()) showStaleExtensionContext()
        return false
      }
      syncing = true

      try {
        if (!await hasLocalDataConsent()) {
          await refreshStatusMessage()
          return false
        }
        const summary = await requestVaCachePageSummary()
        if (summary && !summary.available) {
          await refreshStatusMessage()
          return false
        }
        syncBtn.disabled = true
        syncBtn.textContent = '…'
        subtitleEl.textContent = 'Syncing claims…'
        subtitleEl.className = 'subtitle'
        detailEl.textContent = 'Keep this tab open until sync finishes.'
        const result = await syncClaimsFromVaPage()

        if (result.ok) {
          autoSyncSucceeded = true
          const claimPart = result.count
            ? `${result.count} claim${result.count === 1 ? '' : 's'}`
            : 'no new claims'
          const appealPart = result.appeals
            ? `, ${result.appeals} appeal${result.appeals === 1 ? '' : 's'}`
            : ''
          subtitleEl.textContent = `Saved ${claimPart}${appealPart} on this device`
          subtitleEl.className = 'subtitle status-ok'
          detailEl.textContent = 'To send decision PDFs to VCH, open the extension’s Letters tab and select your letters.'
          return true
        }

        if (automatic) {
          return false
        }
        subtitleEl.textContent = result.error || 'Could not sync claims'
        subtitleEl.className = 'subtitle status-error'
        detailEl.textContent = onMyVa
          ? 'Make sure you are signed in to My VA, wait a moment, then tap Sync again.'
          : 'Make sure you are signed in and this claims page finished loading.'
        return false
      } catch (error) {
        if (!automatic) {
          subtitleEl.textContent = error instanceof Error ? error.message : 'Could not sync claims'
          subtitleEl.className = 'subtitle status-error'
          detailEl.textContent = onMyVa
            ? 'Make sure you are signed in to My VA, wait a moment, then tap Sync again.'
            : 'Make sure you are signed in and this claims page finished loading.'
        }
        return false
      } finally {
        syncing = false
        syncBtn.disabled = false
        syncBtn.textContent = 'Sync'
      }
    }

    function delay(ms: number) {
      return new Promise<void>(resolve => { ctx.setTimeout(resolve, ms) })
    }

    async function runAutomaticSyncLoop(generation: number) {
      for (const waitMs of AUTO_SYNC_DELAYS_MS) {
        if (generation !== autoSyncGeneration || autoSyncSucceeded || contextStale) return
        await delay(waitMs)
        if (generation !== autoSyncGeneration || autoSyncSucceeded || contextStale) return
        if (await runSync(true)) return
      }
      if (generation !== autoSyncGeneration || autoSyncSucceeded || contextStale) return
      await refreshStatusMessage()
    }

    function scheduleAutomaticSync() {
      autoSyncGeneration++
      const generation = autoSyncGeneration
      void runAutomaticSyncLoop(generation)
    }

    syncBtn.addEventListener('click', () => {
      void runSync()
    })

    claimsLinkBtn.addEventListener('click', () => {
      window.location.assign(VA_TRACK_CLAIMS_PAGE)
    })

    openBtn.addEventListener('click', () => {
      if (contextStale || !isExtensionContextValid()) {
        showStaleExtensionContext()
        window.location.reload()
        return
      }

      void (async () => {
        const response = await safeExtensionRuntimeMessage<{ ok?: boolean, hint?: string }>({
          type: 'OPEN_EXTENSION_POPUP'
        })

        if (response?.ok) return

        detailEl.textContent = response?.hint
          || 'Click the VCH Web Extension icon in your browser toolbar.'
        subtitleEl.className = 'subtitle status-warn'
      })()
    })

    collapseBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      void applyCollapsed(!shell.classList.contains('collapsed'))
    })

    shell.querySelector('.header')?.addEventListener('click', () => {
      if (shell.classList.contains('collapsed')) {
        void applyCollapsed(false)
      }
    })

    void (async () => {
      if (contextStale) {
        showStaleExtensionContext()
        return
      }

      await applyCollapsed(await readTrackClaimsBarCollapsed())
      await refreshStatusMessage()
      scheduleAutomaticSync()
    })()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || autoSyncSucceeded || contextStale) return
    void refreshStatusMessage().then(() => scheduleAutomaticSync())
  })

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) scheduleAutomaticSync()
  })
  }
})
