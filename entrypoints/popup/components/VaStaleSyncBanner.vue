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
const lastSyncedLabel = computed(() => formatLastSynced(props.lastSyncedAt))
watch(() => props.lastSyncedAt, (value, _, onCleanup) => {
  fresh.value = isRecentVaDeviceSync(value)
  if (!fresh.value || !value) return
  const expiresIn = Date.parse(value) + FRESH_DEVICE_SYNC_MS - Date.now()
  const timer = setTimeout(() => { fresh.value = false }, expiresIn + 1)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })
</script>

<template>
  <div v-if="liveSession ? lastSyncedLabel : !fresh" class="flex items-center gap-2">
    <p v-if="lastSyncedLabel" class="text-xs text-muted">Last Synced · {{ lastSyncedLabel }}</p>
    <UButton
      v-if="!liveSession"
      class="shrink-0"
      size="xs"
      color="neutral"
      variant="outline"
      label="Sign in to VA.gov"
      @click="$emit('signIn')"
    />
  </div>
</template>
