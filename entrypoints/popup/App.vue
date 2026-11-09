<script setup lang="ts">
import { EXTENSION_VERSION } from '@/shared/version'
import VaClaimTrackerTab from './components/VaClaimTrackerTab.vue'
import PrivacySettings from './components/PrivacySettings.vue'
import VaProfileTab from './components/VaProfileTab.vue'
import { hasLocalDataConsent, hasVaProfileCloudApproval, PRIVACY_CONSENT_KEY } from '@/shared/privacyConsent'
import { readHubSession } from '@/shared/hubSessionRead'
import { readVaTrackBridgeCachePayload } from '@/shared/vaTrackBridgeCache'
import { saveVaProfileToVch } from '@/shared/vaProfileImport'
import { claimBuilderTrackClaimsUrl } from '@/shared/urls'
import HubTab from './components/HubTab.vue'
import PopupFooterNav from './components/PopupFooterNav.vue'
import ConnectionStatusBar from './components/ConnectionStatusBar.vue'
import PopupUiScaleControl from './components/PopupUiScaleControl.vue'
import PopupThemeToggle from './components/PopupThemeToggle.vue'
import PopupExpandControl from './components/PopupExpandControl.vue'

const activeTab = ref('profile')
const privacyReady = ref(false)
const localConsent = ref(false)
const privacyOpen = ref(false)
const savingVaData = ref(false)
const trackAfterSave = ref(false)
const toast = useToast()

watch(activeTab, (tab) => {
  if (tab !== 'profile') trackAfterSave.value = false
})

async function openTracker() {
  trackAfterSave.value = false
  await browser.tabs.create({ url: claimBuilderTrackClaimsUrl({ source: 'extension', sync: '1' }) })
}

async function trackOnVch() {
  if (savingVaData.value) return
  savingVaData.value = true
  try {
    const track = await readVaTrackBridgeCachePayload()
    if (track.claims.length || track.appeals.length) {
      const { accountId } = await readHubSession()
      if (!accountId || !await hasVaProfileCloudApproval(accountId)) {
        trackAfterSave.value = true
        activeTab.value = 'profile'
        return
      }
      const result = await saveVaProfileToVch({ accountId, track, ratings: null, letters: [] })
      if (!result.track) throw new Error(result.trackError || 'Could not save claims and appeals.')
    }
    await openTracker()
  } catch (error) {
    toast.add({ title: 'Could not open Claim Tracker', description: error instanceof Error ? error.message : 'Try again in a moment.', color: 'error' })
  } finally {
    savingVaData.value = false
  }
}

async function refreshConsent() {
  localConsent.value = await hasLocalDataConsent()
  privacyReady.value = true
}
onMounted(() => {
  void refreshConsent()
  void browser.runtime.sendMessage({ type: 'VCH_SYNC_APPROVED_VA_TRACK' }).catch(() => undefined)
  const onChanged = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && PRIVACY_CONSENT_KEY in changes) void refreshConsent()
  }
  browser.storage.onChanged.addListener(onChanged)
  onUnmounted(() => browser.storage.onChanged.removeListener(onChanged))
})
function acceptedPrivacy() { localConsent.value = true; privacyOpen.value = false }
function clearedPrivacy() { localConsent.value = false; privacyOpen.value = false }

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

const tabs = computed(() => [
  { label: 'VA Profile', value: 'profile', icon: 'i-lucide-user-round' },
  { label: 'Claims', value: 'claims', icon: 'i-lucide-clipboard-list' },
  { label: 'Hub', value: 'hub', icon: 'i-lucide-house' }
].map(tab => ({ ...tab, disabled: savingVaData.value })))
</script>

<template>
  <UApp
    class="popup-app"
    :toaster="{
      position: 'top-center',
      max: 1,
      duration: 5000,
      ui: { base: 'mx-auto w-max max-w-full wrap-anywhere [&>[data-slot=wrapper]]:w-auto' }
    }"
  >
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
                VA tools with optional VCH imports
              </p>
            </div>
            <div class="flex shrink-0 items-start gap-1.5">
              <PopupExpandControl />
              <PopupThemeToggle />
              <PopupUiScaleControl />
            </div>
          </div>
          <ConnectionStatusBar v-if="localConsent" />
        </header>

        <UTabs
          v-if="localConsent && !privacyOpen"
          v-model="activeTab"
          :items="tabs"
          default-value="profile"
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
          <p v-if="!privacyReady" role="status" class="py-4 text-sm text-muted">Loading your privacy preferences…</p>
          <PrivacySettings v-else-if="!localConsent || privacyOpen" :accepted="localConsent" @accepted="acceptedPrivacy" @cleared="clearedPrivacy" @close="privacyOpen = false" />
          <VaProfileTab
            v-if="privacyReady && localConsent"
            v-show="activeTab === 'profile' && !privacyOpen"
            :active="activeTab === 'profile' && !privacyOpen"
            :track-after-save="trackAfterSave"
            @privacy="privacyOpen = true"
            @saving="savingVaData = $event"
            @track="openTracker"
          />
          <VaClaimTrackerTab v-if="localConsent && !privacyOpen && activeTab === 'claims'" :tracking="savingVaData" @track="trackOnVch" />
          <HubTab v-if="localConsent && !privacyOpen && activeTab === 'hub'" />
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
