<script setup lang="ts">
import { usePopupUiScale } from '../composables/usePopupUiScale'

const { presets, activePresetId, setPreset, ready } = usePopupUiScale()
</script>

<template>
  <div
    v-if="ready"
    class="flex shrink-0 flex-col items-end gap-0.5"
    role="group"
    aria-label="Popup text size"
  >
    <span class="text-[0.6rem] font-medium uppercase tracking-wide text-muted">Size</span>
    <div class="flex rounded-lg border border-default bg-elevated/40 p-0.5">
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        class="min-w-[1.65rem] rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold transition"
        :class="activePresetId === preset.id
          ? 'bg-primary text-white shadow-sm'
          : 'text-muted hover:bg-elevated hover:text-highlighted'"
        :title="preset.title"
        :aria-pressed="activePresetId === preset.id"
        @click="setPreset(preset.id)"
      >
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>
