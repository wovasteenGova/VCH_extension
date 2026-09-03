<script setup lang="ts">
import { EXTENSION_VERSION } from '@/shared/version'
import VaAppealsTab from './components/VaAppealsTab.vue'
import VaClaimTrackerTab from './components/VaClaimTrackerTab.vue'
import VaRatingsTab from './components/VaRatingsTab.vue'
import HubTab from './components/HubTab.vue'
import HubDestinations from './components/HubDestinations.vue'
import ConnectionStatusBar from './components/ConnectionStatusBar.vue'

const activeTab = ref('claims')

const tabs = [
  { label: 'Claims', value: 'claims', icon: 'i-lucide-clipboard-list' },
  { label: 'Ratings', value: 'ratings', icon: 'i-lucide-percent' },
  { label: 'Appeals', value: 'appeals', icon: 'i-lucide-scale' },
  { label: 'Hub', value: 'hub', icon: 'i-lucide-house' }
]
</script>

<template>
  <UApp class="popup-app">
    <div class="popup-shell flex h-full flex-col gap-2 overflow-hidden p-3">
      <div class="popup-chrome shrink-0 space-y-2">
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

      <div class="flex min-h-0 flex-1 flex-col overflow-visible">
        <div class="popup-tab-scroll custom-scrollbar relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <VaClaimTrackerTab v-show="activeTab === 'claims'" />
          <VaRatingsTab v-show="activeTab === 'ratings'" />
          <VaAppealsTab v-show="activeTab === 'appeals'" />
          <HubTab v-show="activeTab === 'hub'" />
        </div>

        <div class="popup-footer relative z-20 shrink-0 overflow-visible space-y-2 border-t border-default/60 pt-2">
          <HubDestinations />

          <p class="popup-disclaimer text-center text-muted text-[0.65rem] leading-relaxed">
            Not affiliated with VA.gov. Sign in at VA.gov first; endpoints may change when VA updates their site.
            <span class="block opacity-70">Extension v{{ EXTENSION_VERSION }}</span>
          </p>
        </div>
      </div>
    </div>
  </UApp>
</template>
