<script setup lang="ts">
import { BRAND_ASSETS } from '@/shared/brandAssets'
import {
  CLAIMBUILDER_URL,
  SYMPTOM_TRACKER_URL,
  VCH_EXTENSION_HUB_PATH,
  hubUrl
} from '@/shared/urls'
import { openHubHome } from '@/shared/connectionStatus'
import HubProductButton from './HubProductButton.vue'

function openUrl(url: string) {
  void browser.tabs.create({ url })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="space-y-2">
      <HubProductButton
        primary
        label="Open ClaimBuilder"
        :logo-src="BRAND_ASSETS.claimBuilder"
        logo-alt="VCH ClaimBuilder"
        @click="openUrl(CLAIMBUILDER_URL)"
      />
      <HubProductButton
        label="Open Symptom Tracker"
        :logo-src="BRAND_ASSETS.symptomTracker"
        logo-alt="VCH Symptom Tracker"
        @click="openUrl(SYMPTOM_TRACKER_URL)"
      />
      <HubProductButton
        label="Open Veterans Central Hub"
        :logo-src="BRAND_ASSETS.hub"
        logo-alt="Veterans Central Hub"
        @click="openHubHome()"
      />
    </div>

    <p class="text-muted text-xs leading-relaxed">
      More Hub pages — Benefits, Services, Donate, Dashboard — are in
      <strong class="font-medium text-highlighted">Hub destinations</strong> below the tabs.
    </p>

    <div class="mt-auto border-t border-default pt-3">
      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-circle-help"
        label="Extension help & install"
        @click="openUrl(hubUrl(VCH_EXTENSION_HUB_PATH))"
      />
    </div>
  </div>
</template>
