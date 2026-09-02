<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import {
  HUB_QUICK_LINKS,
  hubUrlForActiveSession,
  type HubQuickLink
} from '@/shared/urls'

withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false
})

const expanded = ref(false)
const sectionRef = ref<HTMLElement | null>(null)
const toggleRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const listMaxHeight = ref<number | null>(null)
const listScrollable = ref(false)

function measureListSpace() {
  if (!expanded.value || !listRef.value || !toggleRef.value) {
    listMaxHeight.value = null
    listScrollable.value = false
    return
  }

  const shell = sectionRef.value?.closest('.popup-shell') as HTMLElement | null
  const chrome = shell?.querySelector('.popup-chrome') as HTMLElement | null
  if (!shell || !chrome) return

  const chromeBottom = chrome.getBoundingClientRect().bottom
  const toggleTop = toggleRef.value.getBoundingClientRect().top
  const available = Math.floor(toggleTop - chromeBottom - 8)
  const naturalHeight = listRef.value.scrollHeight

  if (available < 72) {
    listMaxHeight.value = 72
    listScrollable.value = true
    return
  }

  listMaxHeight.value = Math.min(naturalHeight, available)
  listScrollable.value = naturalHeight > available
}

watch(expanded, async (isExpanded) => {
  if (!isExpanded) {
    listMaxHeight.value = null
    listScrollable.value = false
    return
  }

  await nextTick()
  measureListSpace()
})

useResizeObserver(sectionRef, () => {
  if (expanded.value) measureListSpace()
})

function openHubLink(link: HubQuickLink) {
  void browser.tabs.create({ url: hubUrlForActiveSession(link.path) })
}
</script>

<template>
  <section
    ref="sectionRef"
    class="relative z-20 shrink-0"
  >
    <div
      v-show="expanded"
      ref="listRef"
      class="hub-destinations-panel absolute bottom-full left-0 right-0 z-30 mb-1 space-y-1.5 overflow-y-auto overscroll-contain rounded-lg border border-default bg-default p-1.5 shadow-lg"
      :class="listScrollable ? 'custom-scrollbar' : 'no-scrollbar'"
      :style="listMaxHeight != null ? { maxHeight: `${listMaxHeight}px` } : undefined"
    >
      <button
        v-for="link in HUB_QUICK_LINKS"
        :key="link.id"
        type="button"
        class="flex w-full items-start gap-2.5 rounded-lg border border-default bg-elevated/40 p-2.5 text-left transition hover:bg-elevated"
        @click="openHubLink(link)"
      >
        <UIcon
          :name="link.icon"
          class="mt-0.5 size-4 shrink-0 text-primary"
        />
        <span class="min-w-0">
          <span class="block font-medium text-xs text-highlighted">{{ link.label }}</span>
          <span v-if="!compact" class="block text-muted text-[0.65rem] leading-snug">{{ link.description }}</span>
        </span>
      </button>
    </div>

    <button
      ref="toggleRef"
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-elevated/60"
      @click="expanded = !expanded"
    >
      <span class="font-medium text-xs text-highlighted">
        Hub destinations
      </span>
      <UIcon
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-4 shrink-0 text-muted"
      />
    </button>
  </section>
</template>
