export const POPUP_COLOR_SCHEME_KEY = 'vch-extension-color-scheme'

/** First visit: light mode until the user picks dark (stored in localStorage). */
export function applyDefaultPopupColorScheme() {
  if (typeof document === 'undefined') return
  try {
    if (!localStorage.getItem(POPUP_COLOR_SCHEME_KEY)) {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }
  } catch {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  }
}
