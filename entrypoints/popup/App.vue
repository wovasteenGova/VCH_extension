<script setup lang="ts">
import { EXTENSION_VERSION } from '@/shared/version'
import VaClaimTrackerTab from './components/VaClaimTrackerTab.vue'
import VaTrackTab from './components/VaTrackTab.vue'
import VaRatingsTab from './components/VaRatingsTab.vue'
import HubTab from './components/HubTab.vue'
import PopupFooterNav from './components/PopupFooterNav.vue'
import ConnectionStatusBar from './components/ConnectionStatusBar.vue'
import PopupUiScaleControl from './components/PopupUiScaleControl.vue'
import PopupThemeToggle from './components/PopupThemeToggle.vue'
import PopupExpandControl from './components/PopupExpandControl.vue'

const activeTab = ref('claims')
const footerLinkPanelOpen = ref(false)

function closeFooterLinkPanel() {
  footerLinkPanelOpen.value = false
}

function onFooterBackdropWheel(e: WheelEvent) {
  const shell = (e.currentTarget as HTMLElement).closest('.popup-shell')
  const scrollEl = shell?.querySelector('.popup-tab-scroll') as HTMLElement | null
  if (!scrollEl) return
  scrollEl.scrollTop += e.deltaY
}

const tabs = [
  { label: 'Claims', value: 'claims', icon: 'i-lucide-clipboard-list' },
  { label: 'Ratings', value: 'ratings', icon: 'i-lucide-percent' },
  { label: 'Track', value: 'track', icon: 'i-lucide-radar' },
  { label: 'Hub', value: 'hub', icon: 'i-lucide-house' }
]
</script>

<template>
  <UApp class="popup-app">
    <div class="popup-shell grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 px-3 pt-3 pb-0">
      <div class="popup-chrome relative z-30 mb-1.5 min-h-0 space-y-2 overflow-visible pb-0.5">
        <header class="flex flex-col gap-1.5">
          <div class="flex items-start gap-3">
            <img
              src="/brand/vch-hub-logo.png"
              alt="Veterans Central Hub"
              class="size-10 shrink-0 rounded-lg object-contain"
            >
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">
                VCH Web Extension
              </p>
              <p class="text-muted text-xs leading-snug">
                VA.gov session data stays on your device
              </p>
            </div>
            <div class="flex shrink-0 items-start gap-1.5">
              <PopupExpandControl />
              <PopupThemeToggle />
              <PopupUiScaleControl />
            </div>
          </div>
          <ConnectionStatusBar />
        </header>

        <UTabs
          v-model="activeTab"
          :items="tabs"
          default-value="claims"
          :unmount-on-hide="true"
          class="vch-popup-tabs w-full"
        />
      </div>

      <!-- min-h-0 + overflow-hidden so 1fr row stays bounded and inner overflow-y scrolls -->
      <div class="relative z-0 h-full min-h-0 overflow-hidden">
        <div
          v-if="footerLinkPanelOpen"
          class="popup-footer-link-backdrop absolute inset-0 z-10 bg-black/50"
          aria-hidden="true"
          @click="closeFooterLinkPanel"
          @wheel.passive="onFooterBackdropWheel"
        />
        <div class="popup-tab-scroll custom-scrollbar relative z-0 h-full min-h-0 overflow-y-auto overscroll-contain">
          <VaClaimTrackerTab v-if="activeTab === 'claims'" />
          <VaRatingsTab v-if="activeTab === 'ratings'" />
          <VaTrackTab v-if="activeTab === 'track'" />
          <HubTab v-if="activeTab === 'hub'" />
        </div>
      </div>

      <div class="popup-footer relative z-20 mt-0 shrink-0 space-y-1 border-t border-default/60 bg-default pt-1.5 pb-0">
        <PopupFooterNav v-model:open="footerLinkPanelOpen" />

        <p class="popup-disclaimer shrink-0 text-center text-muted text-[0.6rem] leading-snug">
          Not affiliated with VA.gov. Sign in at VA.gov first; endpoints may change when VA updates their site.
          <span class="opacity-70"> · Extension v{{ EXTENSION_VERSION }}</span>
        </p>
      </div>
    </div>
  </UApp>
</template>
