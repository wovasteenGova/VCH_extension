<script setup lang="ts">
import { VA_SIGN_IN_PAGE } from '@/shared/vaEndpoints'
import { fetchVaAppeals, formatVaDate } from '@/shared/vaClient'
import { parseVaAppealsList, type ParsedVaAppeal } from '@/shared/vaAppealParse'
import { readVaDeviceCache, saveVaAppealsCache } from '@/shared/vaDeviceCache'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const loading = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const rows = ref<ParsedVaAppeal[]>([])

const openCount = computed(() => rows.value.filter(row => row.active).length)

async function hydrateAppealsFromDevice() {
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
  if (!cache.appeals.length) return false
  rows.value = cache.appeals
  return true
}

async function loadAppeals() {
  loading.value = true
  error.value = null

  const response = await fetchVaAppeals()
  loading.value = false

  if (!response.ok) {
    const restored = await hydrateAppealsFromDevice()
    if (restored) {
      isStale.value = true
      error.value = null
      return
    }
    isStale.value = false
    error.value = response.error
    rows.value = []
    return
  }

  rows.value = parseVaAppealsList(response.data)
  isStale.value = false
  await saveVaAppealsCache(rows.value)
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
}

function openVaSignIn() {
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

onMounted(async () => {
  await hydrateAppealsFromDevice()
  void loadAppeals()
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
      v-if="isStale"
      :last-synced-at="lastSyncedAt"
      @sign-in="openVaSignIn"
    />

    <UAlert
      v-if="error && !rows.length"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="error"
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
      </template>
    </UAlert>

    <div v-if="loading && !rows.length" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <ul v-else class="space-y-2">
      <li
        v-if="rows.length === 0"
        class="rounded-lg border border-dashed border-default p-4 text-center text-muted text-sm"
      >
        No appeals returned for this session.
      </li>
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
