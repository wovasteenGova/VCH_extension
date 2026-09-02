<script setup lang="ts">
defineProps<{
  label: string
  logoSrc: string
  logoAlt: string
  primary?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
    :class="primary
      ? 'border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border-default bg-elevated/40 hover:bg-elevated'"
    @click="emit('click')"
  >
    <img
      :src="logoSrc"
      :alt="logoAlt"
      class="size-9 shrink-0 rounded-md object-contain"
      :class="primary ? 'bg-white/10 ring-1 ring-white/15' : 'bg-default ring-1 ring-default'"
    >
    <span class="min-w-0 flex-1 font-medium text-sm">
      {{ label }}
    </span>
    <UIcon
      name="i-lucide-external-link"
      class="size-4 shrink-0 opacity-70"
    />
  </button>
</template>
