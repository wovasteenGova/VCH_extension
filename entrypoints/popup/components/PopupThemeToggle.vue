<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import type { ClaimColorThemeId } from '@/shared/claimColorThemes'
import { usePopupColorTheme } from '../composables/usePopupColorTheme'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const pickerOpen = ref(false)
const pickerRoot = ref<HTMLElement | null>(null)

const { themeId, ready, activeTheme, themes, setTheme, hydrate } = usePopupColorTheme()

onMounted(() => {
  void hydrate()
})

onClickOutside(pickerRoot, () => {
  pickerOpen.value = false
})

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

async function selectTheme(id: ClaimColorThemeId) {
  await setTheme(id)
  pickerOpen.value = false
}
</script>

<template>
  <div v-if="ready" ref="pickerRoot" class="relative z-40 shrink-0">
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-default/80 bg-elevated/40 transition hover:border-primary/40 hover:bg-elevated/70"
        :aria-label="`Color theme: ${activeTheme.label}. Open theme picker.`"
        :aria-expanded="pickerOpen"
        :title="`Color theme: ${activeTheme.label}`"
        @click="togglePicker"
      >
        <span
          class="size-5 rounded-md border border-black/10 shadow-sm ring-1 ring-inset ring-white/30"
          :style="{ background: activeTheme.swatch }"
          aria-hidden="true"
        />
      </button>

      <UColorModeButton
        size="xs"
        color="neutral"
        variant="ghost"
        class="shrink-0"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      />
    </div>

    <div
      v-if="pickerOpen"
      class="absolute right-0 top-full z-[100] mt-1.5 w-[11.25rem] rounded-lg border border-default bg-default p-2 shadow-xl ring-1 ring-black/5"
      role="dialog"
      aria-label="Color theme"
    >
      <p class="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-muted">
        Color theme
      </p>
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="relative size-8 cursor-pointer rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          :class="themeId === theme.id
            ? 'border-primary ring-2 ring-primary/25'
            : 'border-default/60 hover:border-primary/35'"
          :aria-label="theme.label"
          :aria-pressed="themeId === theme.id"
          :title="theme.label"
          @click="selectTheme(theme.id)"
        >
          <span
            class="absolute inset-0.5 rounded-md border border-black/10"
            :style="{ background: theme.swatch }"
            aria-hidden="true"
          />
        </button>
      </div>
      <p class="mt-1.5 text-[0.6875rem] leading-snug text-muted">
        {{ activeTheme.label }}
      </p>
    </div>
  </div>
</template>
