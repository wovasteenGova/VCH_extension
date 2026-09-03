import { formatLastSynced, readVaCacheMeta } from '@/shared/vaDeviceCache'
import {
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextValid,
  safeExtensionRuntimeMessage
} from '@/shared/extensionContext'
import { syncClaimsFromVaPage } from '@/shared/vaPageClaimsSync'
import {
  readTrackClaimsBarCollapsed,
  writeTrackClaimsBarCollapsed
} from '@/shared/vaTrackClaimsBarPrefs'

const BAR_HOST_ID = 'vch-web-ext-track-claims-bar'

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
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(201, 162, 39, 0.15);
  border: 1px solid rgba(201, 162, 39, 0.35);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  color: #e8c547;
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
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
  padding: 0 12px 12px;
}
.status-ok { color: #86efac; }
.status-warn { color: #fcd34d; }
.status-error { color: #fca5a5; }
.collapsed .body,
.collapsed .subtitle,
.collapsed .actions .btn:not(.icon-btn) {
  display: none;
}
.collapsed .header {
  padding: 8px 10px;
  cursor: pointer;
}
`

export default defineContentScript({
  matches: [
    'https://www.va.gov/track-claims/*',
    'https://va.gov/track-claims/*'
  ],
  runAt: 'document_idle',
  main() {
    if (document.getElementById(BAR_HOST_ID)) return

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
        <div class="logo" aria-hidden="true">VCH</div>
        <div class="title-wrap">
          <p class="title">VCH Web Extension</p>
          <p class="subtitle" data-role="subtitle">Checking your claims…</p>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-role="sync">Sync</button>
          <button type="button" class="btn btn-ghost" data-role="open-ext">Open</button>
          <button type="button" class="btn btn-ghost icon-btn" data-role="collapse" aria-label="Collapse">−</button>
        </div>
      </div>
      <div class="body">
        <p class="subtitle" data-role="detail">Claims saved on this device after a successful sync.</p>
      </div>
    `
    shadow.appendChild(shell)
    document.body.appendChild(host)

    const subtitleEl = shell.querySelector('[data-role="subtitle"]') as HTMLElement
    const detailEl = shell.querySelector('[data-role="detail"]') as HTMLElement
    const syncBtn = shell.querySelector('[data-role="sync"]') as HTMLButtonElement
    const openBtn = shell.querySelector('[data-role="open-ext"]') as HTMLButtonElement
    const collapseBtn = shell.querySelector('[data-role="collapse"]') as HTMLButtonElement

    let syncing = false
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

      const meta = await readVaCacheMeta()
      const synced = formatLastSynced(meta.lastSyncedAt)
      if (meta.hasClaims) {
        subtitleEl.textContent = synced
          ? `Claims saved on this device · Last synced ${synced}`
          : 'Claims saved on this device'
        subtitleEl.className = 'subtitle status-ok'
        detailEl.textContent = 'Open the extension popup for ratings, appeals, and ClaimBuilder tools.'
        return
      }
      subtitleEl.textContent = 'Sign in above, then tap Sync to save claims on this device.'
      subtitleEl.className = 'subtitle status-warn'
      detailEl.textContent = 'Nothing cached yet — sync here after your claims list loads.'
    }

    async function runSync() {
      if (syncing || contextStale || !isExtensionContextValid()) {
        if (!contextStale && !isExtensionContextValid()) showStaleExtensionContext()
        return
      }
      syncing = true
      syncBtn.disabled = true
      syncBtn.textContent = '…'
      subtitleEl.textContent = 'Syncing claims…'
      subtitleEl.className = 'subtitle'

      const result = await syncClaimsFromVaPage()
      syncing = false
      syncBtn.disabled = false
      syncBtn.textContent = 'Sync'

      if (result.ok) {
        const claimPart = result.count
          ? `${result.count} claim${result.count === 1 ? '' : 's'}`
          : 'no new claims'
        const appealPart = result.appeals
          ? `, ${result.appeals} appeal${result.appeals === 1 ? '' : 's'}`
          : ''
        subtitleEl.textContent = `Saved ${claimPart}${appealPart} on this device`
        subtitleEl.className = 'subtitle status-ok'
        detailEl.textContent = 'Open the extension popup — claims, ratings, and appeals stay on this device.'
        return
      }

      subtitleEl.textContent = result.error || 'Could not sync claims'
      subtitleEl.className = 'subtitle status-error'
      detailEl.textContent = 'Make sure you are signed in and this claims page finished loading.'
    }

    syncBtn.addEventListener('click', () => {
      void runSync()
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
      // Auto-sync once VA finishes loading the authenticated claims shell.
      window.setTimeout(() => {
        void runSync()
      }, 2500)
    })()
  }
})
