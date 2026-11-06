import {
  fetchHubSavedItemBookmarks,
  fetchHubSavedItemsTotalCount,
  HubSavedItemsNoTabError,
  type HubSavedBookmarkRow
} from '@/shared/vchHubSavedItems'

export function useVchBookmarks() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const rows = ref<HubSavedBookmarkRow[]>([])
  /** Matches Hub header: total rows in savedItems localStorage */
  const totalCount = ref(0)

  async function refreshTotalCount() {
    totalCount.value = await fetchHubSavedItemsTotalCount()
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      rows.value = await fetchHubSavedItemBookmarks(500)
      await refreshTotalCount()
    } catch (e) {
      rows.value = []
      await refreshTotalCount()
      if (e instanceof HubSavedItemsNoTabError) {
        error.value = e.message
      } else {
        error.value =
          e instanceof Error
            ? e.message
            : 'Could not load Hub saved items. Open Hub in a tab and try again.'
      }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    rows,
    totalCount,
    load,
    refreshTotalCount
  }
}
