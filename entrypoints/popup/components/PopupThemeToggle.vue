<script setup lang="ts">
import { onClickOutside, useColorMode } from '@vueuse/core'
import type { ClaimColorThemeId } from '@/shared/claimColorThemes'
import { usePopupColorTheme } from '../composables/usePopupColorTheme'

const pickerOpen = ref(false)
const pickerRoot = ref<HTMLElement | null>(null)

const { themeId, activeTheme, themes, setTheme, hydrate } = usePopupColorTheme()

const colorScheme = useColorMode({
  storageKey: 'vch-extension-color-scheme',
  attribute: 'class',
  modes: {
    light: 'light',
    dark: 'dark'
  }
})

const isDark = computed(() => colorScheme.value === 'dark')

onMounted(() => {
  void hydrate()
})

onClickOutside(pickerRoot, () => {
  pickerOpen.value = false
})

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

function toggleLightDark() {
  colorScheme.value = isDark.value ? 'light' : 'dark'
}

async function selectTheme(id: ClaimColorThemeId) {
  await setTheme(id)
  pickerOpen.value = false
}
</script>

<template>
  <div ref="pickerRoot" class="relative z-50 flex shrink-0 flex-col items-end gap-0.5">
    <span class="text-[0.6rem] font-medium uppercase tracking-wide text-muted">Theme</span>
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

      <button
        type="button"
        class="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-default/80 bg-elevated/40 text-muted transition hover:border-primary/40 hover:bg-elevated/70 hover:text-highlighted"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="isDark ? 'Light mode' : 'Dark mode'"
        @click="toggleLightDark"
      >
        <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" />
      </button>
    </div>

    <div
      v-if="pickerOpen"
      class="absolute right-0 top-full z-[300] mt-1.5 w-[11.25rem] rounded-lg border border-default bg-default p-2 shadow-xl ring-1 ring-black/10"
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
