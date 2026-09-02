export const SCROLLBAR_HIDE_DELAY_MS = 1500

export const SCROLLBAR_OPT_OUT_CLASS = 'no-scrollbar'
export const SCROLLBAR_AUTO_CLASS = 'vcb-scrollbar-auto'
export const SCROLLBAR_VISIBLE_CLASS = 'is-scrollbar-visible'

const SCROLLBAR_NEVER_CLASSES = [SCROLLBAR_OPT_OUT_CLASS] as const

export function resolveScrollElement(target: EventTarget | null): HTMLElement | null {
  if (!target || typeof target !== 'object') return null
  if ('documentElement' in target) {
    return (target as Document).documentElement
  }
  if ('classList' in target && 'scrollHeight' in target) {
    return target as HTMLElement
  }
  return null
}

export function isScrollbarOptOut(element: HTMLElement): boolean {
  if (SCROLLBAR_NEVER_CLASSES.some(className => element.classList.contains(className))) {
    return true
  }
  return Boolean(element.closest(`.${SCROLLBAR_OPT_OUT_CLASS}`))
}

export function isScrollableElement(element: HTMLElement): boolean {
  if (typeof getComputedStyle !== 'function') return false

  if (element === document.documentElement) {
    return element.scrollHeight > element.clientHeight
      || element.scrollWidth > element.clientWidth
  }

  const style = getComputedStyle(element)
  const overflowY = style.overflowY
  const overflowX = style.overflowX
  const scrollableY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
    && element.scrollHeight > element.clientHeight
  const scrollableX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
    && element.scrollWidth > element.clientWidth
  return scrollableY || scrollableX
}

type ScrollbarState = {
  hideTimer: ReturnType<typeof setTimeout> | null
}

export function createScrollbarRevealController(
  hideDelayMs = SCROLLBAR_HIDE_DELAY_MS
) {
  const trackedElements = new Map<HTMLElement, ScrollbarState>()

  function cleanup(element: HTMLElement) {
    const state = trackedElements.get(element)
    if (state?.hideTimer) clearTimeout(state.hideTimer)
    element.classList.remove(SCROLLBAR_AUTO_CLASS, SCROLLBAR_VISIBLE_CLASS)
    trackedElements.delete(element)
  }

  function hide(element: HTMLElement, state: ScrollbarState) {
    element.classList.remove(SCROLLBAR_VISIBLE_CLASS)
    if (state.hideTimer) {
      clearTimeout(state.hideTimer)
      state.hideTimer = null
    }
  }

  function reveal(element: HTMLElement) {
    if (!element.isConnected) return
    if (isScrollbarOptOut(element)) return
    if (!isScrollableElement(element)) return

    const state = trackedElements.get(element) ?? { hideTimer: null }
    trackedElements.set(element, state)

    element.classList.add(SCROLLBAR_AUTO_CLASS, SCROLLBAR_VISIBLE_CLASS)
    if (state.hideTimer) clearTimeout(state.hideTimer)
    state.hideTimer = setTimeout(() => hide(element, state), hideDelayMs)
  }

  function syncTrackedScrollbars() {
    for (const element of trackedElements.keys()) {
      if (!element.isConnected) cleanup(element)
    }
  }

  function dispose() {
    for (const element of [...trackedElements.keys()]) cleanup(element)
  }

  return { reveal, syncTrackedScrollbars, dispose }
}

export function bindAutoHideScrollbars(
  root: Document | HTMLElement = document,
  hideDelayMs = SCROLLBAR_HIDE_DELAY_MS
): () => void {
  const { reveal, syncTrackedScrollbars, dispose } = createScrollbarRevealController(hideDelayMs)

  function onScroll(event: Event) {
    const element = resolveScrollElement(event.target)
    if (element) reveal(element)
    syncTrackedScrollbars()
  }

  root.addEventListener('scroll', onScroll, { capture: true, passive: true })

  return () => {
    root.removeEventListener('scroll', onScroll, { capture: true })
    dispose()
  }
}
