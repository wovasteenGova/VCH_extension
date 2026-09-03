import { buildVchComUrlFromLocation } from '@/shared/vchUsToComUrl'

const BANNER_HOST_ID = 'vch-us-to-com-banner'
const DISMISS_KEY = 'vch-us-to-com-banner-dismissed'

const BANNER_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.shell {
  pointer-events: auto;
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(6, 12, 18, 0.72);
}
.card {
  width: min(24rem, calc(100vw - 32px));
  border-radius: 14px;
  border: 1px solid rgba(201, 162, 39, 0.45);
  background: linear-gradient(180deg, #1a1f2b 0%, #12151c 100%);
  color: #f3f4f6;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
  padding: 18px 18px 16px;
}
.title {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 650;
}
.copy {
  margin: 0 0 14px;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #cbd5e1;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.primary,
.secondary {
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.primary {
  background: #c9a227;
  color: #111827;
}
.secondary {
  background: transparent;
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.35);
}
`

export default defineContentScript({
  matches: [
    'https://*.veteranscentralhub.us/*',
    'https://veteranscentralhub.us/*'
  ],
  runAt: 'document_idle',
  main() {
    const comUrl = buildVchComUrlFromLocation(window.location)
    if (!comUrl) return

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    if (document.getElementById(BANNER_HOST_ID)) return

    const host = document.createElement('div')
    host.id = BANNER_HOST_ID
    const shadow = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = BANNER_STYLES

    const shell = document.createElement('div')
    shell.className = 'shell'

    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `
      <p class="title">VCH has moved to .com</p>
      <p class="copy">This <strong>.us</strong> address is legacy. Sign in and saved data work best on our <strong>.com</strong> site. Continue on veteranscentralhub.com.</p>
      <div class="actions">
        <button type="button" class="primary" data-action="go">Continue on .com</button>
        <button type="button" class="secondary" data-action="dismiss">Stay on .us for now</button>
      </div>
    `

    shell.appendChild(card)
    shadow.append(style, shell)
    document.documentElement.appendChild(host)

    shadow.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      const action = target?.closest('[data-action]')?.getAttribute('data-action')
      if (action === 'go') {
        window.location.assign(comUrl)
        return
      }
      if (action === 'dismiss') {
        try {
          sessionStorage.setItem(DISMISS_KEY, '1')
        } catch {
          /* ignore */
        }
        host.remove()
      }
    })
  }
})
