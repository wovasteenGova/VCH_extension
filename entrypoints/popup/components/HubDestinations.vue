<script setup lang="ts">
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

function openHubLink(link: HubQuickLink) {
  void browser.tabs.create({ url: hubUrlForActiveSession(link.path) })
}
</script>

<template>
  <section class="shrink-0 border-t border-default pt-2">
    <button
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

    <div
      v-show="expanded"
      class="mt-1 max-h-36 space-y-1.5 overflow-y-auto overscroll-contain pb-1 custom-scrollbar"
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
  </section>
</template>
