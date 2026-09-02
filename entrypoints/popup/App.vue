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
  <UApp>
    <div class="popup-shell flex flex-col gap-2 overflow-hidden p-3">
      <header class="flex shrink-0 flex-col gap-1.5">
        <div class="flex items-center gap-3">
          <img
            src="/brand/vch-hub-logo.png"
            alt="Veterans Central Hub"
            class="size-10 rounded-lg object-contain"
          >
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-highlighted">
              VCH Claim Tracker
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
        class="vch-popup-tabs flex min-h-0 w-full flex-1 flex-col"
      >
        <template #content="{ item }">
          <div class="flex min-h-0 flex-1 flex-col pt-2">
            <VaClaimTrackerTab v-if="item.value === 'claims'" />
            <VaRatingsTab v-else-if="item.value === 'ratings'" />
            <VaAppealsTab v-else-if="item.value === 'appeals'" />
            <HubTab v-else-if="item.value === 'hub'" />
          </div>
        </template>
      </UTabs>

      <HubDestinations />

      <p class="shrink-0 text-center text-muted text-[0.65rem] leading-relaxed">
        Not affiliated with VA.gov. Sign in at VA.gov first; endpoints may change when VA updates their site.
        <span class="block opacity-70">Extension v{{ EXTENSION_VERSION }}</span>
      </p>
    </div>
  </UApp>
</template>
