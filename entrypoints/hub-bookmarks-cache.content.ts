import { VCH_HUB_ORIGINS } from '@/shared/hubOrigins'
import { HUB_SAVED_ITEMS_STORAGE_KEY, parseHubBookmarkSnapshot, saveHubBookmarkCache } from '@/shared/vchHubSavedItems'

export default defineContentScript({
  matches: VCH_HUB_ORIGINS.map(origin => `${origin}/*`),
  runAt: 'document_idle',
  main() {
    let lastSaved: string | null = null

    async function syncBookmarks() {
      try {
        const raw = localStorage.getItem(HUB_SAVED_ITEMS_STORAGE_KEY)
        if (raw === lastSaved) return
        if (await saveHubBookmarkCache(parseHubBookmarkSnapshot(raw))) lastSaved = raw
      } catch {
        // Keep the last good list if the site data or extension is unavailable.
      }
    }

    void syncBookmarks()
    window.addEventListener('storage', (event) => {
      if (event.key === HUB_SAVED_ITEMS_STORAGE_KEY || event.key === null) void syncBookmarks()
    })
    // Hub writes same-tab changes to localStorage. Capture them on return or departure.
    document.addEventListener('visibilitychange', () => { void syncBookmarks() })
  }
})
