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
import { formatLastSynced, subscribeVaDeviceCache } from '@/shared/vaDeviceCache'

const props = defineProps<{ active: boolean, trackAfterSave?: boolean }>()
const emit = defineEmits<{ privacy: [], saving: [busy: boolean], track: [] }>()
const profileTabs = [
  { label: 'Ratings', value: 'ratings', slot: 'ratings', icon: 'i-lucide-percent' },
  { label: 'Letters', value: 'letters', slot: 'letters', icon: 'i-lucide-file-text' }
]
const activeProfileTab = ref('ratings')
const ratings = ref<InstanceType<typeof VaRatingsTab> | null>(null)
const letters = ref<InstanceType<typeof VaDecisionLettersTab> | null>(null)
const approval = ref<VaProfileCloudApproval | null>(null)
const approvalCardOpen = ref<boolean | null>(null)
const approvalCard = ref<HTMLElement | null>(null)
const importAfterApproval = ref(false)
const draftAutoSyncTrack = ref(true)
const updatingApproval = ref(false)
const lastSyncedAt = ref<string | null>(null)
const importedLetterKeys = ref<string[]>([])
const includeTrack = ref(true)
const track = shallowRef<VaTrackBridgeCachePayload | null>(null)
const saving = ref(false)
const accountId = ref<string | null>(null)
const accountLabel = ref('Checking VCH account…')
const accountReady = ref(false)
const previewOpen = ref(false)
const feedback = ref('')
const feedbackColor = ref<'success' | 'warning' | 'error'>('success')
const toast = useToast()

const ratingsReady = computed(() => ratings.value?.ready === true)
const previewItems = computed(() => ratingsReady.value ? ratings.value?.previewItems ?? [] : [])
const selectedLetters = computed(() => letters.value?.selectedLetters ?? [])
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
    draftAutoSyncTrack.value = true
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
  track.value = await readVaTrackBridgeCachePayload()
}

onMounted(() => {
  void refreshAccount()
  void refreshTrack()
  const stop = subscribeVaDeviceCache(() => { void refreshTrack() })
  const onSyncSettingsChanged = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && !updatingApproval.value && (PRIVACY_CONSENT_KEY in changes || (VA_PROFILE_SYNC_STATE_PREFIX + accountId.value) in changes)) {
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
  if (!accountId.value || saving.value || updatingApproval.value) return false
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
  const approved = await updateApproval(id => approveVaProfileCloudSave(id, draftAutoSyncTrack.value))
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
  if (!approval.value) {
    draftAutoSyncTrack.value = enabled
    return
  }
  void updateApproval(id => setVaProfileTrackAutoSync(id, enabled))
}

async function revokeApproval() {
  if (await updateApproval(revokeVaProfileCloudApproval)) {
    feedback.value = 'Sync approval revoked. Data already saved remains in your VCH account.'
    feedbackColor.value = 'success'
  }
}

async function save(scope: 'all' | 'track' | 'letters' = 'all') {
  const hasSelection = scope === 'letters' ? selectedLetters.value.length : scope === 'track' ? hasTrack.value : canSave.value
  if (!approval.value || !hasSelection || saving.value || updatingApproval.value) return
  saving.value = true
  emit('saving', true)
  feedback.value = ''
  const notification = toast.add({ title: 'Saving VA data…', description: 'Keep this window open until saving finishes.', icon: 'i-lucide-loader-circle', ui: { icon: 'animate-spin' }, duration: 0, close: false })
  try {
    const result = await saveVaProfileToVch({
      accountId: accountId.value,
      track: scope === 'track' || (scope === 'all' && includeTrack.value) ? track.value : null,
      ratings: scope === 'all' && ratingsReady.value && ratings.value ? JSON.parse(JSON.stringify(ratings.value.payload)) : null,
      letters: scope === 'track' ? [] : JSON.parse(JSON.stringify(selectedLetters.value))
    }, {
      progress: description => toast.update(notification.id, { description }),
      letter: outcome => letters.value?.recordOutcome(outcome)
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
          :disabled="saving || updatingApproval"
          @click="approvalCardOpen = !showApprovalCard"
        >{{ approval ? 'Sync Approved' : 'Set up sync' }}</UButton>
        <UButton size="xs" variant="ghost" icon="i-lucide-settings-2" :disabled="saving || updatingApproval" @click="$emit('privacy')">Data controls</UButton>
      </div>
    </div>
    <section v-if="showApprovalCard" id="va-profile-sync-card" ref="approvalCard" class="space-y-3 rounded-lg border border-default bg-elevated/30 p-3" aria-labelledby="save-va-data-heading">
      <div class="flex items-start justify-between gap-2">
        <h3 id="save-va-data-heading" class="text-base font-semibold text-highlighted">Save VA data to your VCH account</h3>
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" aria-label="Dismiss sync card" :disabled="saving || updatingApproval" @click="dismissApprovalCard" />
      </div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium">{{ accountLabel }}</p>
        <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" aria-label="Refresh VCH account" :disabled="saving" @click="refreshAccount" />
      </div>
      <p class="text-xs text-muted">{{ lastSyncLabel ? `Last synced ${lastSyncLabel}` : 'No sync recorded yet' }}</p>
      <p class="text-sm text-muted">Approve once for this VCH account. Save unlocked ratings and profile details, selected decision letters, and claims and appeals from this browser.</p>
      <UCheckbox
        :model-value="approval?.autoSyncTrack ?? draftAutoSyncTrack"
        :disabled="saving || updatingApproval"
        label="Auto-sync claims and appeals"
        description="Sync when claims or appeals on this device change. Ratings and decision letters are saved when you choose Save."
        @update:model-value="setAutoSync($event === true)"
      />
      <p v-if="importAfterApproval" class="text-sm font-medium">Import {{ selectedLetters.length }} selected decision {{ selectedLetters.length === 1 ? 'letter' : 'letters' }} after approving.</p>
      <p v-else-if="trackAfterSave" class="text-sm font-medium">Sync your claims and appeals to open Claim Tracker.</p>
      <UCheckbox v-if="approval && hasTrack" v-model="includeTrack" :disabled="saving || updatingApproval" :label="`Include ${trackSummary} in this save`" />
      <p v-if="approval" class="text-sm">{{ ratingsReady ? 'Ratings and profile included.' : 'Unlock ratings in the Ratings tab to include them.' }} {{ selectedLetters.length }} decision letter{{ selectedLetters.length === 1 ? '' : 's' }} selected.</p>
      <div v-if="approval && previewItems.length" class="rounded-md border border-default p-2.5">
        <button type="button" class="flex w-full items-center justify-between text-left text-sm font-medium" :aria-expanded="previewOpen" @click="previewOpen = !previewOpen">
          Will send to your VCH account ({{ previewItems.length }} profile items)
          <UIcon :name="previewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
        <ul v-if="previewOpen" class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
          <li v-for="item in previewItems" :key="item.id">{{ item.label }}<span v-if="item.detail">: {{ item.detail }}</span></li>
        </ul>
      </div>
      <UButton v-if="accountId && !approval" block icon="i-lucide-circle-check" :loading="updatingApproval || saving" @click="approveSync">{{ importAfterApproval && selectedLetters.length ? 'Approve and import selected letters' : trackAfterSave && hasTrack ? 'Approve and open Claim Tracker' : 'Approve sync' }}</UButton>
      <template v-else-if="approval">
        <UButton block icon="i-lucide-cloud-upload" :loading="saving" :disabled="!canSave || updatingApproval" @click="save()">{{ trackAfterSave && includeTrack && hasTrack ? 'Save and open Claim Tracker' : 'Save to my VCH account' }}</UButton>
        <UButton size="sm" variant="ghost" color="error" :disabled="saving || updatingApproval" @click="revokeApproval">Revoke sync approval</UButton>
      </template>
      <UButton v-else-if="accountReady" block variant="outline" @click="openHubSignIn">Sign in to Hub</UButton>
      <p v-if="feedback" role="status" class="text-sm" :class="feedbackColor === 'success' ? 'text-success' : feedbackColor === 'warning' ? 'text-warning' : 'text-error'">{{ feedback }}</p>
    </section>
    <fieldset :disabled="saving" class="min-w-0">
      <UTabs
        v-model="activeProfileTab"
        :items="profileTabs"
        :unmount-on-hide="false"
        size="sm"
        :ui="{
          list: 'gap-2 bg-transparent p-0',
          indicator: 'hidden',
          trigger: 'rounded-none border-x border-default data-[state=active]:border-primary data-[state=active]:text-primary'
        }"
      >
        <template #ratings>
          <VaRatingsTab ref="ratings" />
        </template>
        <template #letters>
          <VaDecisionLettersTab
            ref="letters"
            :active="active && activeProfileTab === 'letters'"
            :account-id="accountId"
            :busy="saving || updatingApproval || !accountReady"
            :imported-letter-keys="importedLetterKeys"
            @import="importSelectedLetters"
          />
        </template>
      </UTabs>
    </fieldset>
  </section>
</template>
