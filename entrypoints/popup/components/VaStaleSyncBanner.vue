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
    title="Using saved data from this device"
    :description="formatLastSynced(lastSyncedAt)
      ? `Last synced ${formatLastSynced(lastSyncedAt)}. Sign in at VA.gov to refresh.`
      : 'Sign in at VA.gov to refresh your VA data.'"
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
