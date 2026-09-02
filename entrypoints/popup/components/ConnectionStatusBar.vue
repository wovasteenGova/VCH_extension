<script setup lang="ts">
import { BRAND_ASSETS } from '@/shared/brandAssets'
import {
  openHubSignIn,
  openVaSignIn,
  probeHubSession,
  probeVaSession,
  type ConnectionState
} from '@/shared/connectionStatus'

const loading = ref(true)
const hub = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const va = ref<ConnectionState>({ connected: false, label: 'Checking…' })

async function refresh() {
  loading.value = true
  const [hubState, vaState] = await Promise.all([
    probeHubSession(),
    probeVaSession()
  ])
  hub.value = hubState
  va.value = vaState
  loading.value = false
}

function onHubClick() {
  if (!hub.value.connected) openHubSignIn()
}

function onVaClick() {
  if (!va.value.connected) openVaSignIn()
}

onMounted(() => {
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
        : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'"
      :title="va.connected ? `VA.gov: ${va.label}` : 'Sign in at VA.gov for claim data'"
      @click="onVaClick"
    >
      <UIcon
        name="i-lucide-shield"
        class="size-3.5 shrink-0 opacity-80"
      />
      <UIcon
        :name="va.connected ? 'i-lucide-check' : 'i-lucide-log-in'"
        class="size-3 shrink-0 opacity-80"
      />
      <span class="truncate text-xs">
        <template v-if="va.connected">
          {{ va.label === 'Active' ? 'VA linked' : va.label }}
        </template>
        <template v-else>
          VA sign-in
        </template>
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
