<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import {
  footerLinkIconAccent,
  hubQuickLinksAsFooterLinks,
  type PopupFooterPanelConfig,
  VA_QUICK_LINKS,
  VCH_TOOLS_LINKS
} from '@/shared/popupFooterLinks'

type FooterPanelId = 'hub' | 'va' | 'tools'

const panelOpen = defineModel<boolean>('open', { default: false })
const expandedPanel = ref<FooterPanelId | null>(null)
const navRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const listMaxHeight = ref<number | null>(null)
const listScrollable = ref(false)

const panels: PopupFooterPanelConfig[] = [
  {
    id: 'hub',
    title: 'Hub destinations',
    icon: 'i-lucide-house',
    accent: { border: 'border-sky-500/50', bg: 'bg-sky-500/15', icon: 'text-sky-400' },
    links: hubQuickLinksAsFooterLinks()
  },
  {
    id: 'va',
    title: 'Quick Links',
    icon: 'i-lucide-link-2',
    accent: { border: 'border-amber-500/50', bg: 'bg-amber-500/15', icon: 'text-amber-400' },
    links: VA_QUICK_LINKS
  },
  {
    id: 'tools',
    title: 'More tools',
    icon: 'i-lucide-layout-grid',
    accent: { border: 'border-emerald-500/50', bg: 'bg-emerald-500/15', icon: 'text-emerald-400' },
    links: VCH_TOOLS_LINKS
  }
]

const activePanel = computed(() =>
  panels.find(panel => panel.id === expandedPanel.value) ?? null
)

function togglePanel(panelId: FooterPanelId) {
  expandedPanel.value = expandedPanel.value === panelId ? null : panelId
}

function closePanel() {
  expandedPanel.value = null
}

function measureListSpace() {
  if (!expandedPanel.value || !listRef.value || !navRef.value) {
    listMaxHeight.value = null
    listScrollable.value = false
    return
  }

  const shell = navRef.value.closest('.popup-shell') as HTMLElement | null
  const chrome = shell?.querySelector('.popup-chrome') as HTMLElement | null
  const footer = shell?.querySelector('.popup-footer') as HTMLElement | null
  if (!shell || !chrome || !footer) return

  const chromeBottom = chrome.getBoundingClientRect().bottom
  const footerTop = footer.getBoundingClientRect().top
  const disclaimer = footer.querySelector('.popup-disclaimer') as HTMLElement | null
  const disclaimerHeight = disclaimer?.offsetHeight ?? 0
  const available = Math.floor(footerTop - chromeBottom - 12 - disclaimerHeight)
  const naturalHeight = listRef.value.scrollHeight

  if (available < 80) {
    listMaxHeight.value = 80
    listScrollable.value = true
    return
  }

  listMaxHeight.value = Math.min(naturalHeight, available)
  listScrollable.value = naturalHeight > available
}

watch(expandedPanel, async (panelId) => {
  panelOpen.value = panelId != null

  if (!panelId) {
    listMaxHeight.value = null
    listScrollable.value = false
    return
  }

  await nextTick()
  measureListSpace()
})

watch(panelOpen, (isOpen) => {
  if (!isOpen) expandedPanel.value = null
})

useResizeObserver(navRef, () => {
  if (expandedPanel.value) measureListSpace()
})

function openLink(url: string) {
  closePanel()
  void browser.tabs.create({ url })
}
</script>

<template>
  <div ref="navRef" class="relative z-30 flex w-full flex-col">
    <div
      v-if="activePanel"
      ref="listRef"
      class="popup-footer-link-panel absolute bottom-full left-0 right-0 z-30 mb-1.5 w-full space-y-1.5 overflow-y-auto overscroll-contain rounded-lg border border-default bg-default p-1.5 shadow-lg"
      :class="listScrollable ? 'custom-scrollbar' : 'no-scrollbar'"
      :style="listMaxHeight != null ? { maxHeight: `${listMaxHeight}px` } : undefined"
    >
      <button
        v-for="(link, index) in activePanel.links"
        :key="link.id"
        type="button"
        class="flex w-full items-start gap-2.5 rounded-lg border border-default bg-elevated/40 p-2.5 text-left transition hover:bg-elevated"
        @click="openLink(link.url)"
      >
        <span
          class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border"
          :class="[footerLinkIconAccent(index).border, footerLinkIconAccent(index).bg]"
        >
          <UIcon
            :name="link.icon"
            class="size-4"
            :class="footerLinkIconAccent(index).icon"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-medium text-xs text-highlighted">{{ link.label }}</span>
          <span class="block text-muted text-[0.65rem] leading-snug">{{ link.description }}</span>
          <span
            v-if="link.warning"
            class="mt-1 block text-[0.65rem] leading-snug text-amber-400"
          >
            {{ link.warning }}
          </span>
        </span>
      </button>
    </div>

    <div class="grid w-full shrink-0 grid-cols-3 gap-1">
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        class="flex min-w-0 flex-col items-center gap-0.5 rounded-md px-0.5 py-1 transition hover:bg-elevated/60"
        :class="expandedPanel === panel.id ? 'bg-elevated/40' : ''"
        @click="togglePanel(panel.id as FooterPanelId)"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-md border"
          :class="[panel.accent.border, panel.accent.bg]"
        >
          <UIcon :name="panel.icon" class="size-3.5" :class="panel.accent.icon" />
        </span>
        <span class="flex min-w-0 items-center gap-0.5">
          <span class="truncate font-medium text-[0.6rem] leading-tight text-highlighted">
            {{ panel.title }}
          </span>
          <UIcon
            :name="expandedPanel === panel.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-3 shrink-0 text-muted"
          />
        </span>
      </button>
    </div>
  </div>
</template>
