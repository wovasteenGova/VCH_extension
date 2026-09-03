<script setup lang="ts">
import { formatLastSynced } from '@/shared/vaDeviceCache'

withDefaults(defineProps<{
  lastSyncedAt?: string | null
  liveSession?: boolean
}>(), {
  liveSession: false
})

defineEmits<{
  signIn: []
}>()
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
    v-else
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
        size="xs"
        color="neutral"
        variant="outline"
        label="Sign in to VA.gov"
        @click="$emit('signIn')"
      />
    </template>
  </UAlert>
</template>
