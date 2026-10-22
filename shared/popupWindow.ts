/** Chrome toolbar action popup max (CSS px). */
export const POPUP_TOOLBAR_HEIGHT_PX = 600

/** Initial size for the detached window; layout uses 100dvh/100% so users can resize freely. */
export const POPUP_EXPANDED_HEIGHT_PX = 760
export const POPUP_EXPANDED_WIDTH_PX = 572

export function isExpandedPopupWindow(): boolean {
  if (typeof window === 'undefined') return false
  if (document.documentElement.classList.contains('popup-expanded')) return true
  return new URLSearchParams(window.location.search).get('expanded') === '1'
}

export function markExpandedPopupWindow() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.add('popup-expanded')
}

export async function openExpandedPopupWindow(): Promise<void> {
  if (!browser.runtime?.getURL || !browser.windows?.create) return
  const url = `${browser.runtime.getURL('popup.html')}?expanded=1`
  await browser.windows.create({
    url,
    type: 'popup',
    width: POPUP_EXPANDED_WIDTH_PX,
    height: POPUP_EXPANDED_HEIGHT_PX,
    focused: true
  })
}
