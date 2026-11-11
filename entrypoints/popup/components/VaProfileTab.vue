<script setup lang="ts">
import VaRatingsTab from './VaRatingsTab.vue'
import VaDecisionLettersTab from './VaDecisionLettersTab.vue'
import { readHubSession } from '@/shared/hubSessionRead'
import { openHubSignIn } from '@/shared/connectionStatus'
import { describeVaProfileImport, readVaProfileSyncState, saveVaProfileToVch, VA_PROFILE_SYNC_STATE_PREFIX } from '@/shared/vaProfileImport'
import {
  approveVaProfileCloudSave,
  readVaProfileCloudApproval,
  revokeVaProfileCloudApproval,
  setVaProfileTrackAutoSync,
  PRIVACY_CONSENT_KEY,
  type VaProfileCloudApproval
} from '@/shared/privacyConsent'
import { readVaTrackBridgeCachePayload, type VaTrackBridgeCachePayload } from '@/shared/vaTrackBridgeCache'
import { checkVaCacheEpoch, formatLastSynced, readVaCacheOwnerEpoch, subscribeVaDeviceCache } from '@/shared/vaDeviceCache'

const props = defineProps<{ active: boolean, tracking?: boolean, trackAfterSave?: boolean }>()
const emit = defineEmits<{ privacy: [], saving: [busy: boolean], track: [] }>()
const profileTabs = [
  { label: 'Ratings', value: 'ratings', slot: 'ratings', labelIcon: 'i-lucide-percent' },
  { label: 'Letters', value: 'letters', slot: 'letters', labelIcon: 'i-lucide-file-text' }
]
const activeProfileTab = ref('ratings')
const ratings = ref<InstanceType<typeof VaRatingsTab> | null>(null)
const letters = ref<InstanceType<typeof VaDecisionLettersTab> | null>(null)
const approval = ref<VaProfileCloudApproval | null>(null)
const approvalCardOpen = ref<boolean | null>(null)
const approvalCard = ref<HTMLElement | null>(null)
const importAfterApproval = ref(false)
const updatingApproval = ref(false)
const lastSyncedAt = ref<string | null>(null)
const importedLetterKeys = ref<string[]>([])
const includeTrack = ref(true)
const track = shallowRef<VaTrackBridgeCachePayload | null>(null)
const trackOwnerEpoch = ref<string | null>(null)
const saving = ref(false)
const syncBusy = computed(() => saving.value || props.tracking || updatingApproval.value)
const accountId = ref<string | null>(null)
const accountLabel = ref('Checking VCH account…')
const accountReady = ref(false)
const previewOpen = ref(false)
const feedback = ref('')
const feedbackColor = ref<'success' | 'warning' | 'error'>('success')
const toast = useToast()

const ratingsReady = computed(() => ratings.value?.ready === true)
const previewItems = computed(() => ratingsReady.value ? ratings.value?.previewItems ?? [] : [])
const selectedLetters = computed(() => {
  const exposed = letters.value?.selectedLetters
  return Array.isArray(exposed) ? exposed : []
})

function letterRowsForImport() {
  const snap = letters.value?.selectedLetterRowsForImport?.()
  if (Array.isArray(snap) && snap.length) return snap
  return JSON.parse(JSON.stringify(selectedLetters.value)) as typeof snap
}
const hasTrack = computed(() => Boolean(track.value && (track.value.claims.length || track.value.appeals.length)))
const trackSummary = computed(() => {
  const claims = track.value?.claims.length ?? 0
  const appeals = track.value?.appeals.length ?? 0
  return `${claims} claim${claims === 1 ? '' : 's'} and ${appeals} appeal${appeals === 1 ? '' : 's'}`
})
const canSave = computed(() => Boolean(accountId.value && ((includeTrack.value && hasTrack.value) || ratingsReady.value || selectedLetters.value.length)))
const showApprovalCard = computed(() => approvalCardOpen.value ?? !approval.value)
const lastSyncLabel = computed(() => formatLastSynced(lastSyncedAt.value))

let accountRefresh = 0
async function refreshAccount() {
  const generation = ++accountRefresh
  const session = await readHubSession()
  const currentApproval = session.accountId ? await readVaProfileCloudApproval(session.accountId) : null
  const syncState = session.accountId ? await readVaProfileSyncState(session.accountId) : null
  if (generation !== accountRefresh) return
  if (accountId.value !== session.accountId) {
    if (accountReady.value) approvalCardOpen.value = null
    if (accountId.value) importAfterApproval.value = false
    feedback.value = ''
  }
  approval.value = currentApproval
  lastSyncedAt.value = syncState?.lastSyncedAt ?? null
  importedLetterKeys.value = syncState?.importedLetterKeys ?? []
  accountId.value = session.accountId
  accountLabel.value = session.connected ? `VCH account: ${session.label}` : 'Sign in to VCH in this browser to save VA data.'
  accountReady.value = true
}

async function refreshTrack() {
  trackOwnerEpoch.value = await readVaCacheOwnerEpoch()
  track.value = await readVaTrackBridgeCachePayload()
}

onMounted(() => {
  void refreshAccount()
  void refreshTrack()
  const stop = subscribeVaDeviceCache(() => { void refreshTrack() })
  const onSyncSettingsChanged = (changes: Record<string, unknown>, area: string) => {
    if ((area === 'local' || area === 'session') && !updatingApproval.value
      && (PRIVACY_CONSENT_KEY in changes || (VA_PROFILE_SYNC_STATE_PREFIX + accountId.value) in changes)) {
      void refreshAccount()
    }
  }
  browser.storage.onChanged.addListener(onSyncSettingsChanged)
  onUnmounted(() => {
    stop()
    browser.storage.onChanged.removeListener(onSyncSettingsChanged)
  })
})

watch(() => props.active, active => {
  if (active) void refreshAccount()
})

watch(() => props.trackAfterSave, (requested) => {
  if (!requested) return
  importAfterApproval.value = false
  openApprovalCard()
})

function openApprovalCard() {
  approvalCardOpen.value = true
  void nextTick(() => approvalCard.value?.scrollIntoView({ block: 'start' }))
}

function dismissApprovalCard() {
  importAfterApproval.value = false
  approvalCardOpen.value = false
  void nextTick(() => document.getElementById('va-profile-sync-toggle')?.focus())
}

async function updateApproval(action: (accountId: string) => Promise<void>) {
  if (!accountId.value || syncBusy.value) return false
  updatingApproval.value = true
  feedback.value = ''
  try {
    await action(accountId.value)
    await refreshAccount()
    return true
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Could not update your sync approval.'
    feedbackColor.value = 'error'
    return false
  } finally {
    updatingApproval.value = false
  }
}

async function approveSync() {
  approvalCardOpen.value = true
  const requestedAccount = accountId.value
  const approved = await updateApproval(approveVaProfileCloudSave)
  if (!approved || requestedAccount !== accountId.value) return
  if (importAfterApproval.value) {
    importAfterApproval.value = false
    await save('letters')
  } else if (props.trackAfterSave && hasTrack.value) {
    await save('track')
  }
}

function importSelectedLetters() {
  if (approval.value) {
    void save('letters')
  } else {
    importAfterApproval.value = true
    openApprovalCard()
  }
}

function setAutoSync(enabled: boolean) {
  const ownerEpoch = trackOwnerEpoch.value
  void updateApproval(async id => {
    if (enabled && (!ownerEpoch || !await checkVaCacheEpoch(ownerEpoch))) {
      throw new Error('Refresh your claims on VA.gov before turning on automatic uploads.')
    }
    await setVaProfileTrackAutoSync(id, enabled ? ownerEpoch : null)
  })
}

async function revokeApproval() {
  if (await updateApproval(revokeVaProfileCloudApproval)) {
    feedback.value = 'Sync approval revoked. Data already saved remains in your VCH account.'
    feedbackColor.value = 'success'
  }
}

async function save(scope: 'all' | 'track' | 'letters' = 'all') {
  const letterBatch = scope === 'track' ? [] : letterRowsForImport()
  const hasSelection = scope === 'letters' ? letterBatch.length > 0 : scope === 'track' ? hasTrack.value : canSave.value
  if (!approval.value || !hasSelection || syncBusy.value) return
  const destinationAccount = accountId.value
  saving.value = true
  emit('saving', true)
  feedback.value = ''
  const notification = toast.add({ title: 'Saving VA data…', description: 'Keep this window open until saving finishes.', icon: 'i-lucide-loader-circle', ui: { icon: 'animate-spin' }, duration: 0, close: false })
  try {
    const result = await saveVaProfileToVch({
      accountId: destinationAccount,
      track: scope === 'track' || (scope === 'all' && includeTrack.value) ? track.value : null,
      ratings: scope === 'all' && ratingsReady.value && ratings.value ? JSON.parse(JSON.stringify(ratings.value.payload)) : null,
      letters: letterBatch
    }, {
      progress: description => toast.update(notification.id, { description }),
      letter: outcome => {
        if (accountId.value === destinationAccount) letters.value?.recordOutcome(outcome)
      }
    })
    const message = describeVaProfileImport(result)
    feedback.value = message.description
    feedbackColor.value = message.color
    toast.update(notification.id, { ...message, icon: message.color === 'success' ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert', ui: { icon: '' }, duration: 6000, close: true })
    if (props.trackAfterSave && result.track && message.color === 'success') emit('track')
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Could not save VA data.'
    feedbackColor.value = 'error'
    toast.update(notification.id, { title: 'Could not save VA data', description: feedback.value, color: 'error', icon: 'i-lucide-circle-alert', ui: { icon: '' }, duration: 6000, close: true })
  } finally {
    saving.value = false
    emit('saving', false)
    void refreshAccount()
    if (scope !== 'track' && letters.value?.refreshImportStatus) {
      // Server receipt can lag behind uploads; merge keys instead of replacing.
      void new Promise(resolve => setTimeout(resolve, 600)).then(() => letters.value?.refreshImportStatus())
    }
  }
}
</script>

<template>
  <section class="space-y-4 py-2" aria-labelledby="va-profile-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="va-profile-heading" class="text-base font-semibold text-highlighted">VA Profile</h2>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          v-if="approval || !showApprovalCard"
          id="va-profile-sync-toggle"
          size="xs"
          variant="soft"
          :color="approval ? 'success' : 'neutral'"
          :icon="approval ? 'i-lucide-circle-check' : 'i-lucide-cloud-upload'"
          aria-controls="va-profile-sync-card"
          :aria-expanded="showApprovalCard"
          @click="approvalCardOpen = !showApprovalCard"
        >{{ approval ? 'Sync Approved' : 'Set up sync' }}</UButton>
        <UButton size="xs" variant="ghost" icon="i-lucide-settings-2" :disabled="updatingApproval" @click="$emit('privacy')">Data controls</UButton>
      </div>
    </div>
    <section v-if="showApprovalCard" id="va-profile-sync-card" ref="approvalCard" class="space-y-3 rounded-lg border border-default bg-elevated/30 p-3" aria-labelledby="save-va-data-heading">
      <div class="flex items-start justify-between gap-2">
        <h3 id="save-va-data-heading" class="text-base font-semibold text-highlighted">Save VA data to your VCH account</h3>
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" aria-label="Dismiss sync card" :disabled="updatingApproval" @click="dismissApprovalCard" />
      </div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium">{{ accountLabel }}</p>
        <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" aria-label="Refresh VCH account" :disabled="updatingApproval" @click="refreshAccount" />
      </div>
      <p class="text-xs text-muted">{{ lastSyncLabel ? `Last synced ${lastSyncLabel}` : 'No sync recorded yet' }}</p>
      <p class="text-sm text-muted">Confirm this is the VCH account you want to send your VA data to. Approval lets you save claims, appeals, unlocked ratings, profile details, and selected claim letters.</p>
      <UCheckbox
        v-if="approval && !trackAfterSave"
        :model-value="Boolean(trackOwnerEpoch && approval.autoSyncTrackOwnerEpoch === trackOwnerEpoch)"
        :disabled="syncBusy || !trackOwnerEpoch"
        label="Automatically upload claims and appeals"
        :description="trackOwnerEpoch ? 'Send changes from this VA.gov account to the VCH account shown above. Ratings and letters require a manual save.' : 'Refresh your claims on VA.gov to enable automatic uploads for that account.'"
        @update:model-value="setAutoSync($event === true)"
      />
      <p v-if="importAfterApproval" class="text-sm font-medium">Import {{ selectedLetters.length }} selected {{ selectedLetters.length === 1 ? 'letter' : 'letters' }} after approving.</p>
      <p v-else-if="trackAfterSave" class="text-sm font-medium">Sync your claims and appeals to open Claim Tracker.</p>
      <UCheckbox v-if="approval && hasTrack && !trackAfterSave" v-model="includeTrack" :disabled="syncBusy" :label="`Include ${trackSummary} in this save`" />
      <p v-if="approval && !trackAfterSave" class="text-sm">{{ ratingsReady ? 'Ratings and profile included.' : 'Unlock ratings in the Ratings tab to include them.' }} {{ selectedLetters.length }} claim letter{{ selectedLetters.length === 1 ? '' : 's' }} selected.</p>
      <div v-if="approval && !trackAfterSave && previewItems.length" class="rounded-md border border-default p-2.5">
        <button type="button" class="flex w-full items-center justify-between text-left text-sm font-medium" :aria-expanded="previewOpen" @click="previewOpen = !previewOpen">
          Will send to your VCH account ({{ previewItems.length }} profile items)
          <UIcon :name="previewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
        <ul v-if="previewOpen" class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
          <li v-for="item in previewItems" :key="item.id">{{ item.label }}<span v-if="item.detail">: {{ item.detail }}</span></li>
        </ul>
      </div>
      <UButton v-if="accountId && !approval" block icon="i-lucide-circle-check" :loading="updatingApproval || saving" :disabled="tracking" @click="approveSync">{{ importAfterApproval && selectedLetters.length ? 'Approve and import selected letters' : trackAfterSave && hasTrack ? 'Approve and open Claim Tracker' : 'Approve sync' }}</UButton>
      <template v-else-if="approval">
        <UButton block icon="i-lucide-cloud-upload" :loading="saving" :disabled="!(trackAfterSave ? hasTrack : canSave) || syncBusy" @click="save(trackAfterSave ? 'track' : 'all')">{{ trackAfterSave ? 'Save and open Claim Tracker' : 'Save to my VCH account' }}</UButton>
        <UButton size="sm" variant="ghost" color="error" :disabled="syncBusy" @click="revokeApproval">Revoke sync approval</UButton>
      </template>
      <UButton v-else-if="accountReady" block variant="outline" @click="openHubSignIn">Sign in to Hub</UButton>
      <p v-if="feedback" role="status" class="text-sm" :class="feedbackColor === 'success' ? 'text-success' : feedbackColor === 'warning' ? 'text-warning' : 'text-error'">{{ feedback }}</p>
    </section>
    <div class="min-w-0">
      <UTabs
        v-model="activeProfileTab"
        :items="profileTabs"
        :unmount-on-hide="false"
        size="md"
        :ui="{
          list: 'gap-2.5 bg-transparent p-0',
          indicator: 'hidden',
          trigger: 'va-profile-tab-trigger group/profile-tab relative min-h-10 rounded-none border-0 text-base font-semibold data-[state=active]:rounded-[20%] data-[state=active]:text-primary',
          label: 'inline-flex items-center gap-2 rounded-[5%] px-3 py-1 group-data-[state=active]/profile-tab:bg-primary/15'
        }"
      >
        <template #default="{ item }">
          <UIcon :name="item.labelIcon" class="size-5 shrink-0" aria-hidden="true" />
          {{ item.label }}
        </template>
        <template #ratings>
          <VaRatingsTab ref="ratings" :active="active && activeProfileTab === 'ratings'" />
        </template>
        <template #letters>
          <VaDecisionLettersTab
            ref="letters"
            :active="active && activeProfileTab === 'letters'"
            :account-id="accountId"
            :busy="syncBusy || !accountReady"
            :imported-letter-keys="importedLetterKeys"
            @import="importSelectedLetters"
          />
        </template>
      </UTabs>
    </div>
  </section>
</template>

<style scoped>
/* Draw the strokes separately so the active tab's radius cannot bend them. */
:deep(.va-profile-tab-trigger::before) {
  content: '';
  position: absolute;
  inset: 0;
  border-inline: 1px solid var(--ui-border);
  pointer-events: none;
}

:deep(.va-profile-tab-trigger[data-state='active']::before) {
  border-inline-color: var(--ui-primary);
}
</style>
