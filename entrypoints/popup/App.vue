<script setup lang="ts">
import { EXTENSION_VERSION } from '@/shared/version'
import VaAppealsTab from './components/VaAppealsTab.vue'
import VaClaimTrackerTab from './components/VaClaimTrackerTab.vue'
import VaRatingsTab from './components/VaRatingsTab.vue'
import HubTab from './components/HubTab.vue'
import PopupFooterNav from './components/PopupFooterNav.vue'
import ConnectionStatusBar from './components/ConnectionStatusBar.vue'

const activeTab = ref('claims')
const footerPanelOpen = ref(false)

const tabs = [
  { label: 'Claims', value: 'claims', icon: 'i-lucide-clipboard-list' },
  { label: 'Ratings', value: 'ratings', icon: 'i-lucide-percent' },
  { label: 'Appeals', value: 'appeals', icon: 'i-lucide-scale' },
  { label: 'Hub', value: 'hub', icon: 'i-lucide-house' }
]
</script>

<template>
  <UApp class="popup-app">
    <div class="popup-shell grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-1.5 overflow-hidden p-3 pb-2">
      <div
        v-if="footerPanelOpen"
        class="popup-footer-backdrop absolute inset-0 z-[15] bg-black/60"
        aria-hidden="true"
        @click="footerPanelOpen = false"
      />

      <div class="popup-chrome relative z-0 min-h-0 space-y-2">
        <header class="flex flex-col gap-1.5">
          <div class="flex items-center gap-3">
            <img
              src="/brand/vch-hub-logo.png"
              alt="Veterans Central Hub"
              class="size-10 rounded-lg object-contain"
            >
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">
                VCH Web Extension
              </p>
              <p class="text-muted text-xs leading-snug">
                VA.gov session data stays on your device
              </p>
            </div>
          </div>
          <ConnectionStatusBar />
        </header>

        <UTabs
          v-model="activeTab"
          :items="tabs"
          default-value="claims"
          :unmount-on-hide="false"
          class="vch-popup-tabs w-full"
        />
      </div>

      <div class="popup-tab-scroll custom-scrollbar relative z-0 min-h-0 overflow-y-auto overscroll-contain">
        <VaClaimTrackerTab v-show="activeTab === 'claims'" />
        <VaRatingsTab v-show="activeTab === 'ratings'" />
        <VaAppealsTab v-show="activeTab === 'appeals'" />
        <HubTab v-show="activeTab === 'hub'" />
      </div>

      <div class="popup-footer relative z-20 shrink-0 space-y-1 border-t border-default/60 pt-1.5">
        <PopupFooterNav v-model:open="footerPanelOpen" />

        <p class="popup-disclaimer shrink-0 text-center text-muted text-[0.6rem] leading-snug">
          Not affiliated with VA.gov. Sign in at VA.gov first; endpoints may change when VA updates their site.
          <span class="opacity-70"> · Extension v{{ EXTENSION_VERSION }}</span>
        </p>
      </div>
    </div>
  </UApp>
</template>
