const BAR_COLLAPSED_KEY = 'vch-va-track-bar-collapsed'

export async function readTrackClaimsBarCollapsed(): Promise<boolean> {
  if (!browser.storage?.local?.get) return false
  try {
    const result = await browser.storage.local.get(BAR_COLLAPSED_KEY)
    return result[BAR_COLLAPSED_KEY] === true
  } catch {
    return false
  }
}

export async function writeTrackClaimsBarCollapsed(collapsed: boolean): Promise<void> {
  if (!browser.storage?.local?.set) return
  try {
    await browser.storage.local.set({ [BAR_COLLAPSED_KEY]: collapsed })
  } catch {
    /* extension context invalidated */
  }
}
