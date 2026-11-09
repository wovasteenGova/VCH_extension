import { HUB_BOOKMARK_CACHE_KEY } from '@/shared/privacyConsent'
import {
  fetchHubBookmarkSnapshot,
  readHubBookmarkCache,
  saveHubBookmarkCache,
  type HubBookmarkSnapshot
} from '@/shared/vchHubSavedItems'

export function useVchBookmarks() {
  const snapshot = shallowRef<HubBookmarkSnapshot | null>(null)
  const refreshing = ref(false)
  const error = ref<string | null>(null)
  const loading = computed(() => refreshing.value && snapshot.value === null)
  const rows = computed(() => snapshot.value?.rows ?? [])
  const totalCount = computed(() => snapshot.value?.totalCount ?? 0)

  async function load() {
    if (refreshing.value) return
    refreshing.value = true
    error.value = null
    try {
      snapshot.value ??= await readHubBookmarkCache()
      const next = await fetchHubBookmarkSnapshot()
      snapshot.value = next
      await saveHubBookmarkCache(next)
    } catch (caught) {
      if (!snapshot.value) {
        error.value = caught instanceof Error ? caught.message : 'Could not load Hub saved items.'
      }
    } finally {
      refreshing.value = false
    }
  }

  const onCacheChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[HUB_BOOKMARK_CACHE_KEY]) return
    snapshot.value = changes[HUB_BOOKMARK_CACHE_KEY].newValue as HubBookmarkSnapshot | undefined ?? null
    if (snapshot.value) error.value = null
  }

  onMounted(() => {
    browser.storage.onChanged.addListener(onCacheChanged)
    void load()
  })
  onUnmounted(() => browser.storage.onChanged.removeListener(onCacheChanged))

  return { loading, refreshing, error, rows, totalCount, load }
}
