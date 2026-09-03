<script setup lang="ts">
import { persistLiveVaCaches } from '@/shared/vaCacheSync'
import { probeVaSession } from '@/shared/connectionStatus'
import { openVaSignIn } from '@/shared/vaSignInNavigation'
import { fetchVaAppeals, formatVaDate } from '@/shared/vaClient'
import { parseVaAppealsList, type ParsedVaAppeal } from '@/shared/vaAppealParse'
import {
  cacheMetaFromDevice,
  isRecentVaDeviceSync,
  readVaDeviceCache,
  saveVaAppealsCache,
  subscribeVaDeviceCache
} from '@/shared/vaDeviceCache'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const loading = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const hasAppealsCache = ref(false)
const hasOtherVaCache = ref(false)
const vaLiveSession = ref(false)
const rows = ref<ParsedVaAppeal[]>([])

const openCount = computed(() => rows.value.filter(row => row.active).length)

const showNotPulledYet = computed(() =>
  !rows.value.length && !hasAppealsCache.value && hasOtherVaCache.value && !loading.value
)

const showSignInPrompt = computed(() =>
  !rows.value.length && !hasAppealsCache.value && !hasOtherVaCache.value && Boolean(error.value) && !loading.value
)

function applyCache(appeals: ParsedVaAppeal[], syncedAt: string | null) {
  if (!appeals.length) return false
  rows.value = appeals
  lastSyncedAt.value = syncedAt
  hasAppealsCache.value = true
  error.value = null
  isStale.value = !(vaLiveSession.value || isRecentVaDeviceSync(syncedAt))
  return true
}

async function refreshMeta() {
  const cache = await readVaDeviceCache()
  const meta = cacheMetaFromDevice(cache)
  hasAppealsCache.value = meta.hasAppeals
  hasOtherVaCache.value = meta.hasAny && !meta.hasAppeals
  lastSyncedAt.value = cache.lastSyncedAt
}

async function hydrateAppealsFromDevice() {
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
  hasAppealsCache.value = cache.appeals.length > 0
  hasOtherVaCache.value = cacheMetaFromDevice(cache).hasAny && !cache.appeals.length
  if (!cache.appeals.length) return false
  rows.value = cache.appeals
  return true
}

async function loadAppeals() {
  const cacheBefore = await readVaDeviceCache()
  const cached = cacheBefore.appeals.length ? cacheBefore.appeals : [...rows.value]

  loading.value = true
  if (cached.length) applyCache(cached, cacheBefore.lastSyncedAt)

  const response = await fetchVaAppeals()
  loading.value = false

  if (!response.ok) {
    await refreshMeta()
    if (applyCache(cached, cacheBefore.lastSyncedAt) || (await hydrateAppealsFromDevice())) {
      error.value = null
      isStale.value = !(vaLiveSession.value || isRecentVaDeviceSync(lastSyncedAt.value))
      return
    }
    isStale.value = false
    error.value = response.error
    return
  }

  const parsed = parseVaAppealsList(response.data)
  if (parsed.length === 0) {
    await refreshMeta()
    if (applyCache(cached, cacheBefore.lastSyncedAt) || (await hydrateAppealsFromDevice())) {
      return
    }
    isStale.value = false
    error.value = null
    return
  }

  rows.value = parsed
  isStale.value = false
  error.value = null
  await saveVaAppealsCache(parsed)
  await persistLiveVaCaches()
  await refreshMeta()
}

async function bootstrapAppeals() {
  const session = await probeVaSession()
  vaLiveSession.value = session.connected
  const restored = await hydrateAppealsFromDevice()
  if (restored) {
    error.value = null
    isStale.value = !(vaLiveSession.value || isRecentVaDeviceSync(lastSyncedAt.value))
  }
  await loadAppeals()
}

function applyIncomingCache(cache: { appeals: ParsedVaAppeal[], lastSyncedAt: string | null }) {
  if (cache.appeals.length) applyCache(cache.appeals, cache.lastSyncedAt)
  void refreshMeta()
}

onMounted(() => {
  const stop = subscribeVaDeviceCache(applyIncomingCache)
  onUnmounted(stop)
  void bootstrapAppeals()
})
</script>

<template>
  <div class="flex flex-col gap-3 pb-1">
    <div class="flex items-center justify-between gap-2">
      <div>
        <p class="font-medium text-sm text-highlighted">
          Appeals &amp; reviews
        </p>
        <p v-if="openCount" class="text-muted text-xs">
          {{ openCount }} open
        </p>
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        aria-label="Refresh appeals"
        @click="loadAppeals"
      />
    </div>

    <VaStaleSyncBanner
      v-if="isStale && rows.length"
      :last-synced-at="lastSyncedAt"
      :live-session="vaLiveSession"
      @sign-in="openVaSignIn"
    />

    <UAlert
      v-if="showNotPulledYet"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Appeals not saved yet"
      description="Ratings or claims are on this device, but appeals have not been pulled. Stay signed in at VA.gov and tap refresh, or open Track claims and tap Sync on the VCH bar."
    >
      <template #actions>
        <UButton size="xs" color="primary" variant="soft" label="Refresh appeals" @click="loadAppeals" />
      </template>
    </UAlert>

    <UAlert
      v-else-if="showSignInPrompt"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="error || 'Could not load appeals'"
      description="Sign in at VA.gov so this tab can save appeals on your device. After that, they stay here even when you are signed out."
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
      </template>
    </UAlert>

    <div v-if="loading && !rows.length" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <ul v-else-if="rows.length" class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.id"
        class="rounded-lg border p-3"
        :class="row.active ? 'border-primary/50 bg-primary/10' : 'border-default bg-elevated/40'"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="min-w-0 font-medium text-sm text-highlighted">
            {{ row.title }}
          </p>
          <UBadge
            :color="row.active ? 'primary' : 'neutral'"
            variant="soft"
            size="sm"
          >
            {{ row.active ? 'Open' : 'Closed' }}
          </UBadge>
        </div>
        <p class="mt-1 text-muted text-xs">
          {{ row.appealKindLabel }} · {{ row.id }}
        </p>
        <p class="text-muted text-xs">
          Status: {{ row.statusLabel }}
        </p>
        <p v-if="row.subtitle && row.active" class="mt-1 text-xs leading-snug text-highlighted/90">
          {{ row.subtitle }}
        </p>
        <p v-if="row.filedDate" class="text-muted text-xs">
          Filed: {{ formatVaDate(row.filedDate) }}
        </p>
        <p v-if="row.updatedAt" class="text-muted text-xs">
          Updated: {{ formatVaDate(row.updatedAt) }}
        </p>
      </li>
    </ul>
  </div>
</template>
