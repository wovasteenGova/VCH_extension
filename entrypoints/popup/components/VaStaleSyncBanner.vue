<script setup lang="ts">
import { formatLastSynced } from '@/shared/vaDeviceCache'

defineProps<{
  lastSyncedAt?: string | null
}>()

defineEmits<{
  signIn: []
}>()
</script>

<template>
  <UAlert
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
