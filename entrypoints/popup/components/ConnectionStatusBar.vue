<script setup lang="ts">
import { onKeyStroke, useResizeObserver } from '@vueuse/core'
import { BRAND_ASSETS } from '@/shared/brandAssets'
import { useVchBookmarks } from '../composables/useVchBookmarks'
import {
  openHubSignIn,
  openVaSignIn,
  probeHubSession,
  probeVaSession,
  type ConnectionState
} from '@/shared/connectionStatus'
import {
  cacheMetaFromDevice,
  describeSavedVaCache,
  readVaCacheMeta,
  subscribeVaDeviceCache,
  type VaCacheMeta
} from '@/shared/vaDeviceCache'
import { hubUrl } from '@/shared/urls'
import type { HubSavedCategory } from '@/shared/vchHubSavedItems'

const loading = ref(true)
const hub = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const va = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const cacheMeta = ref<VaCacheMeta>({
  lastSyncedAt: null,
  vaLabel: null,
  hasClaims: false,
  hasAppeals: false,
  hasRatings: false,
  hasProfile: false,
  hasAny: false
})

const savedLabel = computed(() => describeSavedVaCache(cacheMeta.value))

const vaChipLabel = computed(() => {
  if (loading.value) return 'Loading…'
  if (va.value.connected) {
    return va.value.label === 'Active' ? 'VA linked' : va.value.label
  }
  if (cacheMeta.value.hasAny) return savedLabel.value.label
  return 'VA sign-in'
})

const vaChipTitle = computed(() => {
  if (loading.value) {
    return 'Checking VA.gov link and saved data on this device…'
  }
  if (va.value.connected) {
    const live = `VA.gov: ${va.value.label === 'Active' ? 'Linked' : va.value.label}`
    return cacheMeta.value.hasAny ? `${live}. ${savedLabel.value.title}` : live
  }
  return savedLabel.value.title
})

const hubChipLabel = computed(() => {
  if (loading.value) return 'Loading…'
  if (hub.value.connected) return hub.value.label
  return 'Hub sign-in'
})

const bookmarksOpen = ref(false)
const connectionBarRef = ref<HTMLElement | null>(null)
/** Distance from viewport top to bottom of connection row; sheet sits below this */
const sheetTopPx = ref(132)
const brokenBookmarkImages = ref<Record<string, boolean>>({})

const {
  loading: bookmarksLoading,
  refreshing: bookmarksRefreshing,
  error: bookmarksError,
  rows: bookmarks,
  load: loadBookmarks,
  totalCount: hubBookmarkCount
} = useVchBookmarks()

onKeyStroke('Escape', () => {
  bookmarksOpen.value = false
})

function measureBookmarkSheetTop() {
  const el = connectionBarRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  sheetTopPx.value = Math.max(56, Math.round(r.bottom))
}

function toggleBookmarks() {
  bookmarksOpen.value = !bookmarksOpen.value
}

function closeBookmarks() {
  bookmarksOpen.value = false
}

const hubBookmarkBadgeText = computed(() => {
  const n = hubBookmarkCount.value
  if (n <= 0) return ''
  return String(n)
})

watch(bookmarksOpen, (open) => {
  if (open) {
    void nextTick(() => measureBookmarkSheetTop())
    void loadBookmarks()
  }
})

useResizeObserver(connectionBarRef, () => {
  if (bookmarksOpen.value) measureBookmarkSheetTop()
})

function openBookmarkUrl(url: string) {
  bookmarksOpen.value = false
  void browser.tabs.create({ url })
}

function openHubSavedPage() {
  void browser.tabs.create({ url: hubUrl('/saved') })
}

function categoryLabel(c: HubSavedCategory): string {
  switch (c) {
    case 'vetdeals':
      return 'Deal'
    case 'blog':
      return 'Article'
    case 'services':
      return 'Service'
    case 'job':
      return 'Job'
    case 'federal-jobs':
      return 'Federal job'
    default:
      return 'Saved'
  }
}

function categoryIcon(c: HubSavedCategory): string {
  switch (c) {
    case 'vetdeals':
      return 'i-lucide-tag'
    case 'blog':
      return 'i-lucide-book-open'
    case 'services':
      return 'i-lucide-handshake'
    case 'job':
      return 'i-lucide-briefcase'
    case 'federal-jobs':
      return 'i-lucide-landmark'
    default:
      return 'i-lucide-bookmark'
  }
}

function onBookmarkImageError(id: string) {
  brokenBookmarkImages.value = { ...brokenBookmarkImages.value, [id]: true }
}

function applyMeta(meta: VaCacheMeta) {
  cacheMeta.value = meta
}

async function refresh() {
  loading.value = true
  try {
    const [hubState, vaState, meta] = await Promise.all([
      probeHubSession(), probeVaSession(), readVaCacheMeta()
    ])
    hub.value = hubState
    va.value = vaState
    applyMeta(meta)
  } catch {
    hub.value = { connected: false, label: 'Check Hub sign-in' }
    va.value = { connected: false, label: 'Could not check VA.gov' }
  } finally { loading.value = false }
}

function onHubClick() {
  if (!hub.value.connected) openHubSignIn()
}

function onVaClick() {
  if (loading.value) return
  if (!va.value.connected) openVaSignIn()
}

function onHubClickGuarded() {
  if (loading.value) return
  onHubClick()
}

onMounted(() => {
  const stop = subscribeVaDeviceCache((cache) => applyMeta(cacheMetaFromDevice(cache)))
  onUnmounted(stop)
  void refresh()
})

defineExpose({ refresh })
</script>

<template>
  <div ref="connectionBarRef" class="flex w-full min-w-0 shrink-0 flex-nowrap items-center gap-1.5">
    <button
      type="button"
      class="inline-flex max-w-[46%] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 transition"
      :class="loading
        ? 'cursor-wait border-default/60 bg-elevated/30 text-muted'
        : hub.connected
          ? 'border-default/80 bg-elevated/50 text-highlighted'
          : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'"
      :title="loading ? 'Checking Hub and VA status…' : (hub.connected ? `VCH Hub: ${hub.label}` : 'Sign in to Veterans Central Hub')"
      :disabled="loading"
      @click="onHubClickGuarded"
    >
      <img
        :src="BRAND_ASSETS.hub"
        alt=""
        class="size-4 shrink-0 rounded object-contain"
      >
      <UIcon
        :name="loading ? 'i-lucide-loader-circle' : hub.connected ? 'i-lucide-check' : 'i-lucide-log-in'"
        class="size-3 shrink-0 opacity-80"
        :class="loading ? 'animate-spin' : ''"
      />
      <span class="truncate text-xs">
        {{ hubChipLabel }}
      </span>
    </button>

    <button
      type="button"
      class="inline-flex w-max min-w-0 max-w-[min(20rem,calc(100%-6rem))] shrink items-center gap-1.5 rounded-md border px-2 py-1 transition"
      :class="loading
        ? 'cursor-wait border-default/60 bg-elevated/30 text-muted'
        : va.connected
          ? 'border-default/80 bg-elevated/50 text-highlighted'
          : cacheMeta.hasAny
            ? 'border-default/80 bg-elevated/40 text-highlighted'
            : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'"
      :title="vaChipTitle"
      :disabled="loading"
      @click="onVaClick"
    >
      <UIcon
        name="i-lucide-shield"
        class="size-3.5 shrink-0 opacity-80"
      />
      <UIcon
        :name="loading ? 'i-lucide-loader-circle' : va.connected ? 'i-lucide-check' : cacheMeta.hasAny ? 'i-lucide-hard-drive' : 'i-lucide-log-in'"
        class="size-3 shrink-0 opacity-80"
        :class="loading ? 'animate-spin' : ''"
      />
      <span class="truncate text-xs">
        {{ vaChipLabel }}
      </span>
    </button>

    <div class="relative ml-auto flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated/60 hover:text-highlighted"
        :class="bookmarksOpen ? 'text-highlighted' : ''"
        :title="`Bookmarks from Hub${hubBookmarkCount > 0 ? ` (${hubBookmarkCount} saved)` : ''}`"
        aria-label="Open bookmarks from Hub"
        aria-haspopup="dialog"
        :aria-expanded="bookmarksOpen"
        @click="toggleBookmarks"
      >
        <UIcon name="i-lucide-bookmark" class="size-[1.35rem]" />
        <span
          v-if="hubBookmarkCount > 0"
          class="pointer-events-none absolute -right-0.5 -top-px flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-brass-600 px-1 text-[0.55rem] font-bold leading-none text-white shadow-sm ring-1 ring-black/15 dark:bg-brass-500 dark:ring-white/20"
        >
          {{ hubBookmarkBadgeText }}
        </span>
      </button>

      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        aria-label="Refresh sign-in status"
        @click="refresh"
      />
    </div>

    <Teleport to="body">
      <Transition name="vch-bookmarks-overlay">
        <div
          v-if="bookmarksOpen"
          class="pointer-events-auto fixed inset-0 z-[240]"
        >
          <div
            class="absolute inset-x-0 top-0 bg-black/25 dark:bg-black/40"
            aria-hidden="true"
            :style="{ height: `${sheetTopPx}px` }"
            @click="closeBookmarks"
          />
          <div
            class="vch-hub-bookmarks-panel absolute inset-x-0 bottom-0 flex min-h-0 flex-col overflow-hidden rounded-t-2xl border-t border-default bg-default shadow-[0_-12px_32px_rgba(0,0,0,0.14)] ring-1 ring-black/5 dark:shadow-[0_-12px_32px_rgba(0,0,0,0.4)] dark:ring-white/10"
            role="dialog"
            aria-label="Bookmarks from Hub"
            :style="{ top: `${sheetTopPx}px` }"
            @click.stop
          >
            <div class="flex shrink-0 items-start justify-between gap-3 border-b border-default/60 px-3 py-3 sm:px-4">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold uppercase tracking-wide text-muted">
                  Bookmarks from Hub
                </p>
                <p class="mt-1 text-sm leading-snug text-toned">
                  Bookmarks saved in this browser. Changes on the Hub sync here.
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="rounded-md p-2.5 text-muted transition hover:bg-elevated/60 hover:text-highlighted"
                  :disabled="bookmarksRefreshing"
                  aria-label="Refresh list"
                  @click="loadBookmarks"
                >
                  <UIcon
                    name="i-lucide-refresh-cw"
                    class="size-5"
                    :class="bookmarksLoading ? 'animate-spin' : ''"
                  />
                </button>
                <UButton
                  type="button"
                  size="sm"
                  color="error"
                  variant="soft"
                  class="shrink-0 ring-1 ring-inset ring-red-500/35"
                  icon="i-lucide-x"
                  aria-label="Close"
                  @click="closeBookmarks"
                />
              </div>
            </div>
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4">
              <div v-if="bookmarksLoading" class="flex flex-1 items-center justify-center py-12">
                <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
              </div>
              <p v-else-if="bookmarksError" class="text-base leading-relaxed text-amber-600 dark:text-amber-400">
                {{ bookmarksError }}
              </p>
              <div
                v-else-if="!bookmarks.length"
                class="flex flex-col gap-3 py-2 text-base leading-relaxed text-toned"
              >
                <p class="text-sm">
                  No saved items yet. Bookmark a listing on the Hub to see it here.
                </p>
                <UButton
                  size="md"
                  color="primary"
                  variant="soft"
                  label="Open Hub bookmarks"
                  @click="openHubSavedPage"
                />
              </div>
              <ul
                v-else
                class="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5"
              >
                <li v-for="b in bookmarks" :key="b.id">
                  <button
                    type="button"
                    class="flex w-full items-stretch gap-3 rounded-xl border border-default/80 bg-elevated/35 px-3 py-3 text-left transition hover:bg-elevated/70 sm:gap-4 sm:px-4 sm:py-3.5"
                    @click="openBookmarkUrl(b.url)"
                  >
                    <div class="relative size-[4.25rem] shrink-0 overflow-hidden rounded-lg border border-default/60 bg-muted/40 sm:size-24">
                      <img
                        v-if="b.imageUrl && !brokenBookmarkImages[b.id]"
                        :src="b.imageUrl"
                        alt=""
                        class="size-full object-cover"
                        loading="lazy"
                        @error="onBookmarkImageError(b.id)"
                      >
                      <div
                        v-else
                        class="flex size-full items-center justify-center bg-elevated/50"
                      >
                        <UIcon :name="categoryIcon(b.category)" class="size-9 text-muted sm:size-11" />
                      </div>
                    </div>
                    <span class="flex min-h-[4.25rem] min-w-0 flex-1 flex-col justify-center gap-1 sm:min-h-24">
                      <span class="inline-flex w-fit items-center rounded-md bg-elevated/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {{ categoryLabel(b.category) }}
                      </span>
                      <span class="line-clamp-2 text-base font-semibold leading-snug text-highlighted sm:text-lg">
                        {{ b.title }}
                      </span>
                      <span class="line-clamp-2 text-sm leading-snug text-muted sm:text-base">
                        {{ b.url }}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.vch-bookmarks-overlay-enter-active,
.vch-bookmarks-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.vch-bookmarks-overlay-enter-from,
.vch-bookmarks-overlay-leave-to {
  opacity: 0;
}

.vch-bookmarks-overlay-enter-active .vch-hub-bookmarks-panel {
  animation: vch-hub-bookmarks-slide-up 0.32s cubic-bezier(0.32, 0.72, 0, 1) both;
}

.vch-bookmarks-overlay-leave-active .vch-hub-bookmarks-panel {
  animation: vch-hub-bookmarks-slide-down 0.22s ease-in both;
}

@keyframes vch-hub-bookmarks-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes vch-hub-bookmarks-slide-down {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
</style>
