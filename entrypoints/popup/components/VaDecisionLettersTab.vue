<script setup lang="ts">
import { listVaDecisionLetters, type VaLetterIndexRow } from '@/shared/vaClaimLetters'
import { sendDecisionLetterToVch } from '@/shared/decisionLetterImport'
import { grantCloudConsent } from '@/shared/privacyConsent'
import { readHubSession } from '@/shared/hubSessionRead'
import { openVaClaimsPage } from '@/shared/vaSignInNavigation'

const letters = ref<VaLetterIndexRow[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const loaded = ref(false)
const importing = ref(false)
const consent = ref(false)
const error = ref('')
const progress = ref('')
const accountLabel = ref('')
const destinationAccountId = ref<string | null>(null)
const outcomes = ref<Record<string, { ok: boolean, message: string }>>({})
const key = (row: VaLetterIndexRow) => `${row.documentUuid}:${row.document_type}`

async function load() {
  if (loading.value || importing.value) return
  loading.value = true
  error.value = ''
  consent.value = false
  try {
    const session = await readHubSession()
    accountLabel.value = session.connected ? session.label : ''
    destinationAccountId.value = session.accountId
    letters.value = await listVaDecisionLetters()
    selected.value = []
    loaded.value = true
  } catch (caught) { error.value = caught instanceof Error ? caught.message : 'Could not read VA decision letters.' }
  finally { loading.value = false }
}

function toggle(row: VaLetterIndexRow, checked: boolean | 'indeterminate') {
  selected.value = checked === true ? [...new Set([...selected.value, key(row)])] : selected.value.filter(value => value !== key(row))
}

async function sendSelected() {
  if (!consent.value || importing.value || !selected.value.length) return
  importing.value = true
  error.value = ''
  const rows = letters.value.filter(row => selected.value.includes(key(row)))
  try {
    const session = await readHubSession()
    if (!destinationAccountId.value || session.accountId !== destinationAccountId.value) {
      throw new Error('Your VCH destination account changed or is not signed in. Refresh letters and confirm the account before sending.')
    }
    await grantCloudConsent('letters')
    let saved = 0
    for (const [index, row] of rows.entries()) {
      progress.value = `Sending letter ${index + 1} of ${rows.length}…`
      try {
        const result = await sendDecisionLetterToVch(row)
        outcomes.value[key(row)] = { ok: true, message: result.duplicate ? 'Already in your VCH library' : 'Saved to your VCH library' }
        selected.value = selected.value.filter(value => value !== key(row))
        saved++
      } catch (caught) {
        outcomes.value[key(row)] = { ok: false, message: caught instanceof Error ? caught.message : 'Import failed. Try this letter again.' }
      }
    }
    progress.value = `Saved ${saved} of ${rows.length} letters. ${saved < rows.length ? 'Unsent letters remain selected for retry.' : 'Open your VCH document library to review them.'}`
  } catch (caught) { error.value = caught instanceof Error ? caught.message : 'Could not import letters.' }
  finally { importing.value = false; consent.value = false }
}
</script>

<template>
  <section class="space-y-3 py-2" aria-labelledby="letters-heading">
    <h2 id="letters-heading" class="font-semibold text-highlighted">VA decision letters</h2>
    <p class="text-sm text-muted">Find the decision PDFs available in your signed-in VA.gov account, then choose which to send to your private VCH document library.</p>
    <div class="flex flex-wrap gap-2">
      <UButton :loading="loading" :disabled="importing" icon="i-lucide-refresh-cw" @click="load">{{ loaded ? 'Refresh letters' : 'Find decision letters' }}</UButton>
      <UButton variant="outline" @click="openVaClaimsPage">Open VA.gov</UButton>
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-if="loaded && !letters.length" class="text-sm text-muted">VA.gov returned no decision letters. This is separate from benefit verification letters. If you expect a letter, check VA.gov’s claim letters page.</p>
    <p v-if="letters.length" class="text-sm font-medium">{{ letters.length }} decision letter{{ letters.length === 1 ? '' : 's' }} available</p>
    <div v-for="row in letters" :key="key(row)" class="space-y-2 rounded-lg border border-default p-3">
      <UCheckbox :model-value="selected.includes(key(row))" :disabled="importing" :label="row.documentTypeLabel || (row.document_type === '27' ? 'Appeal decision' : 'Claim decision or notification')" @update:model-value="toggle(row, $event)" />
      <p class="pl-6 text-xs text-muted">{{ row.letterDate?.slice(0, 10) || 'Date not provided by VA' }}</p>
      <p v-if="outcomes[key(row)]" role="status" class="text-sm" :class="outcomes[key(row)]!.ok ? 'text-success' : 'text-error'">{{ outcomes[key(row)]!.message }}</p>
    </div>
    <div v-if="letters.length" class="space-y-3 rounded-lg border border-default p-3">
      <p class="text-sm">{{ accountLabel ? `VCH account: ${accountLabel}` : 'Sign in to VCH in this browser before sending letters.' }}</p>
      <UCheckbox v-model="consent" :disabled="importing" label="Send my selected decision PDFs to VCH, where they will be stored and analyzed in my private document library." />
      <UButton :disabled="!consent || !selected.length || importing" :loading="importing" icon="i-lucide-cloud-upload" @click="sendSelected">Send selected to VCH ({{ selected.length }})</UButton>
      <p class="text-xs text-muted">Keep this window open until the import is confirmed. VA letters are fetched only when you send them. Nothing is attached to a claim automatically.</p>
    </div>
    <p v-if="progress" role="status" aria-live="polite" class="text-sm">{{ progress }}</p>
  </section>
</template>
