import { VCH_HUB_ORIGINS } from '@/shared/hubOrigins'

const HOST_ID = 'vch-hub-extension-return'
const QUERY = 'vchExtensionReturn'
const DISMISS_KEY = 'vch-hub-extension-return-dismissed'

export default defineContentScript({
  matches: VCH_HUB_ORIGINS.map(origin => `${origin}/*`),
  runAt: 'document_idle',
  main() {
    if (new URLSearchParams(window.location.search).get(QUERY) !== '1') return
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }
    if (document.getElementById(HOST_ID)) return

    const host = document.createElement('div')
    host.id = HOST_ID
    host.setAttribute(
      'style',
      [
        'position:fixed',
        'left:50%',
        'bottom:20px',
        'transform:translateX(-50%)',
        'z-index:2147483645',
        'max-width:min(22rem,calc(100vw - 24px))',
        'padding:14px 14px 12px',
        'border-radius:14px',
        'border:1px solid rgba(201,162,39,0.45)',
        'background:#12151c',
        'color:#f3f4f6',
        'box-shadow:0 16px 40px rgba(0,0,0,0.45)',
        'font:600 0.95rem/1.35 system-ui,sans-serif'
      ].join(';')
    )

    const text = document.createElement('p')
    text.setAttribute('style', 'margin:0 0 10px;font-weight:500;font-size:0.82rem;line-height:1.45;color:#cbd5e1')
    text.textContent = 'When you finish signing in, click the VCH Web Extension icon in your browser toolbar to continue.'

    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Got it'
    button.setAttribute(
      'style',
      'width:100%;border:none;border-radius:10px;padding:9px 12px;font:600 0.8rem system-ui,sans-serif;cursor:pointer;background:#c9a227;color:#111827'
    )
    button.addEventListener('click', () => {
      try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
      host.remove()
    })

    host.append(text, button)
    document.body.append(host)
  }
})
