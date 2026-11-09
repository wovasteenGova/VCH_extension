<script setup lang="ts">
import VaRatingsTab from './VaRatingsTab.vue'
import VaDecisionLettersTab from './VaDecisionLettersTab.vue'
import { readHubSession } from '@/shared/hubSessionRead'
import { openHubSignIn } from '@/shared/connectionStatus'
import { describeVaProfileImport, saveVaProfileToVch } from '@/shared/vaProfileImport'

defineEmits<{ privacy: [] }>()
const profileTabs = [
  { label: 'Ratings', value: 'ratings', slot: 'ratings', icon: 'i-lucide-percent' },
  { label: 'Letters', value: 'letters', slot: 'letters', icon: 'i-lucide-file-text' }
]
const ratings = ref<InstanceType<typeof VaRatingsTab> | null>(null)
const letters = ref<InstanceType<typeof VaDecisionLettersTab> | null>(null)
const approved = ref(false)
const saving = ref(false)
const accountId = ref<string | null>(null)
const accountLabel = ref('Checking VCH account…')
const previewOpen = ref(false)
const feedback = ref('')
const feedbackColor = ref<'success' | 'warning' | 'error'>('success')
const toast = useToast()

const ratingsReady = computed(() => ratings.value?.ready === true)
const previewItems = computed(() => ratingsReady.value ? ratings.value?.previewItems ?? [] : [])
const selectedLetters = computed(() => letters.value?.selectedLetters ?? [])
const canSave = computed(() => Boolean(accountId.value && (ratingsReady.value || selectedLetters.value.length)))

async function refreshAccount() {
  approved.value = false
  const session = await readHubSession()
  accountId.value = session.accountId
  accountLabel.value = session.connected ? `VCH account: ${session.label}` : 'Sign in to VCH in this browser to save VA data.'
}

onMounted(() => { void refreshAccount() })
// A changed preview needs a new approval; do not reset halfway through our own save.
watch(() => JSON.stringify([ratingsReady.value, previewItems.value, selectedLetters.value.map(row => [row.documentUuid, row.document_type])]), () => {
  if (!saving.value) approved.value = false
})

async function save() {
  if (!approved.value || !canSave.value || saving.value) return
  saving.value = true
  feedback.value = ''
  const notification = toast.add({ title: 'Saving VA data…', description: 'Keep this window open until saving finishes.', icon: 'i-lucide-loader-circle', ui: { icon: 'animate-spin' }, duration: 0, close: false })
  try {
    const result = await saveVaProfileToVch({
      approved: approved.value,
      accountId: accountId.value,
      ratings: ratingsReady.value && ratings.value ? JSON.parse(JSON.stringify(ratings.value.payload)) : null,
      letters: JSON.parse(JSON.stringify(selectedLetters.value))
    }, {
      progress: description => toast.update(notification.id, { description }),
      letter: outcome => letters.value?.recordOutcome(outcome)
    })
    const message = describeVaProfileImport(result)
    feedback.value = message.description
    feedbackColor.value = message.color
    toast.update(notification.id, { ...message, icon: message.color === 'success' ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert', ui: { icon: '' }, duration: 6000, close: true })
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Could not save VA data.'
    feedbackColor.value = 'error'
    toast.update(notification.id, { title: 'Could not save VA data', description: feedback.value, color: 'error', icon: 'i-lucide-circle-alert', ui: { icon: '' }, duration: 6000, close: true })
    await refreshAccount()
  } finally {
    saving.value = false
    approved.value = false
  }
}
</script>

<template>
  <section class="space-y-4 py-2" aria-labelledby="va-profile-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="va-profile-heading" class="text-base font-semibold text-highlighted">VA Profile</h2>
      <UButton size="xs" variant="ghost" icon="i-lucide-settings-2" :disabled="saving" @click="$emit('privacy')">Data controls</UButton>
    </div>
    <fieldset :disabled="saving" class="min-w-0">
      <UTabs :items="profileTabs" default-value="ratings" :unmount-on-hide="false" size="sm">
        <template #ratings>
          <VaRatingsTab ref="ratings" />
        </template>
        <template #letters>
          <VaDecisionLettersTab ref="letters" />
        </template>
      </UTabs>
    </fieldset>
    <section class="space-y-3 rounded-lg border border-default bg-elevated/30 p-3" aria-labelledby="save-va-data-heading">
      <h3 id="save-va-data-heading" class="text-base font-semibold text-highlighted">Save VA data to your VCH account</h3>
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium">{{ accountLabel }}</p>
        <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" aria-label="Refresh VCH account" :disabled="saving" @click="refreshAccount" />
      </div>
      <p class="text-sm text-muted">Save your unlocked ratings and profile details to VCH and send your selected decision PDFs to your private document library for storage and analysis.</p>
      <p class="text-sm">{{ ratingsReady ? 'Ratings and profile included.' : 'Unlock ratings in the Ratings tab to include them.' }} {{ selectedLetters.length }} decision letter{{ selectedLetters.length === 1 ? '' : 's' }} selected.</p>
      <div v-if="previewItems.length" class="rounded-md border border-default p-2.5">
        <button type="button" class="flex w-full items-center justify-between text-left text-sm font-medium" :aria-expanded="previewOpen" @click="previewOpen = !previewOpen">
          Will send to your VCH account ({{ previewItems.length }} profile items)
          <UIcon :name="previewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
        <ul v-if="previewOpen" class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
          <li v-for="item in previewItems" :key="item.id">{{ item.label }}<span v-if="item.detail">: {{ item.detail }}</span></li>
        </ul>
      </div>
      <UCheckbox v-model="approved" :disabled="saving || !canSave" label="I approve sending the ratings, profile details, and selected decision letters listed above to my signed-in VCH account." />
      <UButton block icon="i-lucide-cloud-upload" :loading="saving" :disabled="!approved || !canSave || saving" @click="save">Save to my VCH account</UButton>
      <UButton v-if="!accountId" block variant="outline" @click="openHubSignIn">Sign in to Hub</UButton>
      <p v-if="feedback" role="status" class="text-sm" :class="feedbackColor === 'success' ? 'text-success' : feedbackColor === 'warning' ? 'text-warning' : 'text-error'">{{ feedback }}</p>
      <p class="text-xs text-muted">Select all or choose individual letters in the Letters tab. Nothing is sent until you approve and click Save. Keep this window open until saving finishes.</p>
    </section>
  </section>
</template>
