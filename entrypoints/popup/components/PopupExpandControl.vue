<script setup lang="ts">
import { isExpandedPopupWindow, openExpandedPopupWindow } from '@/shared/popupWindow'

const showExpand = ref(!isExpandedPopupWindow())

async function expand() {
  await openExpandedPopupWindow()
}
</script>

<template>
  <div v-if="showExpand" class="flex shrink-0 flex-col items-end gap-0.5">
    <span class="text-[0.6rem] font-medium uppercase tracking-wide text-muted">View</span>
    <button
      type="button"
      class="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-default/80 bg-elevated/40 text-muted transition hover:border-primary/40 hover:bg-elevated/70 hover:text-highlighted"
      title="Open in a resizable window"
      aria-label="Open in a resizable window"
      @click="expand"
    >
      <UIcon name="i-lucide-maximize-2" class="size-4" />
    </button>
  </div>
</template>
