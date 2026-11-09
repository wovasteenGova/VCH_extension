<script setup lang="ts">
import { formatLastSynced, FRESH_DEVICE_SYNC_MS, isRecentVaDeviceSync } from '@/shared/vaDeviceCache'

const props = withDefaults(defineProps<{
  lastSyncedAt?: string | null
  liveSession?: boolean
}>(), {
  liveSession: false
})

defineEmits<{
  signIn: []
}>()

const fresh = ref(false)
watch(() => props.lastSyncedAt, (value, _, onCleanup) => {
  fresh.value = isRecentVaDeviceSync(value)
  if (!fresh.value || !value) return
  const expiresIn = Date.parse(value) + FRESH_DEVICE_SYNC_MS - Date.now()
  const timer = setTimeout(() => { fresh.value = false }, expiresIn + 1)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })
</script>

<template>
  <UAlert
    v-if="liveSession"
    color="neutral"
    variant="soft"
    icon="i-lucide-hard-drive"
    title="Showing saved VA data"
    :description="formatLastSynced(lastSyncedAt)
      ? `Last saved on this device ${formatLastSynced(lastSyncedAt)}. Use refresh if you want to pull again.`
      : 'Showing data saved on this device.'"
  />
  <UAlert
    v-else-if="!fresh"
    color="warning"
    variant="soft"
    icon="i-lucide-cloud-off"
    title="Not up to date"
    :description="formatLastSynced(lastSyncedAt)
      ? `Showing data saved on this device (last synced ${formatLastSynced(lastSyncedAt)}). Sign in at VA.gov to refresh.`
      : 'Showing data saved on this device. Sign in at VA.gov to refresh.'"
  >
    <template #actions>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        label="Sign in to VA.gov"
        @click="$emit('signIn')"
      />
    </template>
  </UAlert>
</template>
