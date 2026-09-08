type TabsApi = typeof browser.tabs

/** Tabs API is only available in extension pages (background, popup), not content scripts. */
export function extensionTabsApi(): TabsApi | null {
  try {
    const tabs = browser.tabs
    if (tabs && typeof tabs.query === 'function') {
      return tabs
    }
  } catch {
    // Missing or restricted in this execution context.
  }
  return null
}
