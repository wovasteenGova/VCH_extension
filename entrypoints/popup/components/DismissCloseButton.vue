<script setup lang="ts">
defineProps<{ label: string, title?: string, disabled?: boolean }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <UButton
    type="button"
    size="sm"
    color="error"
    variant="soft"
    icon="i-lucide-x"
    class="vch-dismiss-close !bg-red-500/10 shrink-0 ring-1 ring-inset ring-red-500/35 hover:!bg-red-500/15 dark:!bg-red-500/15 dark:hover:!bg-red-500/20"
    :aria-label="label"
    :title="title ?? 'Close'"
    :disabled="disabled"
    @click="$emit('click')"
  />
</template>
