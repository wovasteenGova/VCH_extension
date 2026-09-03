<script setup lang="ts">
import { BRAND_ASSETS } from '@/shared/brandAssets'
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
  if (va.value.connected) {
    return va.value.label === 'Active' ? 'VA linked' : va.value.label
  }
  if (cacheMeta.value.hasAny) return savedLabel.value.label
  return 'VA sign-in'
})

const vaChipTitle = computed(() => {
  if (va.value.connected) {
    const live = `VA.gov: ${va.value.label === 'Active' ? 'Linked' : va.value.label}`
    return cacheMeta.value.hasAny ? `${live}. ${savedLabel.value.title}` : live
  }
  return savedLabel.value.title
})

function applyMeta(meta: VaCacheMeta) {
  cacheMeta.value = meta
}

async function refresh() {
  loading.value = true
  const [hubState, vaState, meta] = await Promise.all([
    probeHubSession(),
    probeVaSession(),
    readVaCacheMeta()
  ])
  hub.value = hubState
  va.value = vaState
  applyMeta(meta)
  loading.value = false
}

function onHubClick() {
  if (!hub.value.connected) openHubSignIn()
}

function onVaClick() {
  if (!va.value.connected) openVaSignIn()
}

onMounted(() => {
  const stop = subscribeVaDeviceCache((cache) => applyMeta(cacheMetaFromDevice(cache)))
  onUnmounted(stop)
  void refresh()
})

defineExpose({ refresh })
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center gap-1.5">
    <button
      type="button"
      class="inline-flex max-w-[55%] items-center gap-1.5 rounded-md border px-2 py-1 transition"
      :class="hub.connected
        ? 'border-default/80 bg-elevated/50 text-highlighted'
        : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'"
      :title="hub.connected ? `VCH Hub: ${hub.label}` : 'Sign in to Veterans Central Hub'"
      @click="onHubClick"
    >
      <img
        :src="BRAND_ASSETS.hub"
        alt=""
        class="size-4 shrink-0 rounded object-contain"
      >
      <UIcon
        :name="hub.connected ? 'i-lucide-check' : 'i-lucide-log-in'"
        class="size-3 shrink-0 opacity-80"
      />
      <span class="truncate text-xs">
        <template v-if="hub.connected">
          {{ hub.label }}
        </template>
        <template v-else>
          Hub sign-in
        </template>
      </span>
    </button>

    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition"
      :class="va.connected
        ? 'border-default/80 bg-elevated/50 text-highlighted'
        : cacheMeta.hasAny
          ? 'border-default/80 bg-elevated/40 text-highlighted'
          : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'"
      :title="vaChipTitle"
      @click="onVaClick"
    >
      <UIcon
        name="i-lucide-shield"
        class="size-3.5 shrink-0 opacity-80"
      />
      <UIcon
        :name="va.connected ? 'i-lucide-check' : cacheMeta.hasAny ? 'i-lucide-hard-drive' : 'i-lucide-log-in'"
        class="size-3 shrink-0 opacity-80"
      />
      <span class="truncate text-xs">
        {{ vaChipLabel }}
      </span>
    </button>

    <UButton
      class="ml-auto"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-refresh-cw"
      :loading="loading"
      aria-label="Refresh sign-in status"
      @click="refresh"
    />
  </div>
</template>
