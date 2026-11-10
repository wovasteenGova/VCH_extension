<script setup lang="ts">
import { decisionLetterKey as key, type VaLetterIndexRow } from '@/shared/vaClaimLetters'
import { requestVaDecisionLetterRefresh } from '@/shared/vaDecisionLetterSync'
import { cacheImportedDecisionLetterKeys, fetchImportedDecisionLetterKeys, readImportedDecisionLetterKeys } from '@/shared/decisionLetterImport'
import type { LetterImportOutcome } from '@/shared/vaProfileImport'
import { VA_CLAIM_LETTERS_PAGE } from '@/shared/vaEndpoints'
import { checkVaCacheEpoch, formatLastSynced, isRecentVaDeviceSync, readVaDeviceCache, subscribeVaDeviceCache, VA_CACHE_OWNER_KEY, type VaDeviceCache } from '@/shared/vaDeviceCache'

const props = defineProps<{ active: boolean, busy: boolean, accountId: string | null, importedLetterKeys: string[] }>()
defineEmits<{ import: [] }>()
const letters = ref<VaLetterIndexRow[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const manualRefresh = ref(false)
const loaded = ref(false)
const fetchedAt = ref<string | null>(null)
const cacheWriteFailed = ref(false)
const lastSyncedLabel = computed(() => formatLastSynced(fetchedAt.value))
const error = ref('')
const outcomes = ref<Record<string, { ok: boolean, message: string }>>({})
const accountImportedKeys = ref<string[]>([])
const hasImportStatus = ref(false)
const checkingStatus = ref(false)
const statusUnavailable = ref(false)
const waitingForImportStatus = computed(() => checkingStatus.value && !hasImportStatus.value)
const toast = useToast()
const imported = computed(() => new Set([
  ...accountImportedKeys.value,
  ...Object.keys(outcomes.value).filter(id => outcomes.value[id]?.ok)
]))
const localReceipts = computed(() => new Set(props.importedLetterKeys))
const selectableLetters = computed(() => letters.value.filter(row => !imported.value.has(key(row))))
const selectedLetters = computed(() => selectableLetters.value.filter(row => selected.value.includes(key(row))))
const selectAllLabel = computed(() => selectableLetters.value.length < letters.value.length ? 'Select all remaining letters' : 'Select all letters')
const selectAllState = computed(() => selectedLetters.value.length === 0 ? false : selectedLetters.value.length === selectableLetters.value.length ? true : 'indeterminate' as const)

let statusRequest = 0
async function refreshImportStatus() {
  const accountId = props.accountId
  if (!accountId) return
  const generation = ++statusRequest
  checkingStatus.value = true
  statusUnavailable.value = false
  try {
    if (!hasImportStatus.value) {
      const cached = await readImportedDecisionLetterKeys(accountId)
      if (generation !== statusRequest) return
      if (cached) applyImportStatus(cached)
    }
    const keys = await fetchImportedDecisionLetterKeys(accountId)
    if (generation !== statusRequest) return
    applyImportStatus(keys)
    outcomes.value = Object.fromEntries(Object.entries(outcomes.value).filter(([, outcome]) => !outcome.ok))
    await cacheImportedDecisionLetterKeys(accountId, keys)
  } catch {
    if (generation === statusRequest) statusUnavailable.value = true
  } finally {
    if (generation === statusRequest) checkingStatus.value = false
  }
}

function applyImportStatus(keys: string[]) {
  hasImportStatus.value = true
  accountImportedKeys.value = keys
  const confirmed = new Set(keys)
  selected.value = selected.value.filter(id => !confirmed.has(id))
}

function applyLetters(rows: VaLetterIndexRow[]) {
  const nextKeys = new Set(rows.map(key))
  letters.value = rows
  selected.value = selected.value.filter(value => nextKeys.has(value))
  loaded.value = true
  error.value = ''
}

function applySavedLetters(saved: NonNullable<VaDeviceCache['letters']>) {
  applyLetters(saved.rows)
  fetchedAt.value = saved.fetchedAt
  cacheWriteFailed.value = false
}

async function load(automatic = false) {
  if (loading.value) return
  if (!automatic) void refreshImportStatus()
  loading.value = true
  manualRefresh.value = !automatic
  error.value = ''
  try {
    if (!loaded.value) {
      const saved = (await readVaDeviceCache()).letters
      if (saved && !loaded.value) applySavedLetters(saved)
    }
    if (automatic && isRecentVaDeviceSync(fetchedAt.value)) return
    const previousKeys = new Set(letters.value.map(key))
    const result = await requestVaDecisionLetterRefresh()
    if (!result.ok) throw new Error(result.error)
    const { rows: next, ownerEpoch, saved } = result
    if (!await checkVaCacheEpoch(ownerEpoch)) {
      throw new Error('Your VA.gov account changed. Refresh the letter list and try again.')
    }
    applyLetters(next)
    fetchedAt.value = saved ? new Date().toISOString() : null
    cacheWriteFailed.value = !saved
    if (!automatic || next.some(row => !previousKeys.has(key(row)))) {
      const title = saved
        ? `${next.length} decision letter${next.length === 1 ? '' : 's'} saved on this device`
        : 'Decision letter list refreshed'
      toast.add({ title, color: 'success' })
    }
  } catch (caught) {
    if (!loaded.value) {
      const saved = (await readVaDeviceCache()).letters
      if (saved && !loaded.value) applySavedLetters(saved)
    }
    if (loaded.value) return
    error.value = caught instanceof Error ? caught.message : 'Could not read VA decision letters.'
    if (!automatic) toast.add({ title: 'Could not find decision letters', description: error.value, color: 'error' })
  } finally {
    loading.value = false
    manualRefresh.value = false
  }
}

onMounted(() => {
  const stop = subscribeVaDeviceCache(({ letters: next }) => {
    if (next && next.fetchedAt !== fetchedAt.value) applySavedLetters(next)
  })
  const onCacheChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[VA_CACHE_OWNER_KEY]) return
    letters.value = []
    selected.value = []
    outcomes.value = {}
    loaded.value = false
    fetchedAt.value = null
    cacheWriteFailed.value = false
    error.value = ''
  }
  browser.storage.onChanged.addListener(onCacheChanged)
  onUnmounted(() => {
    stop()
    browser.storage.onChanged.removeListener(onCacheChanged)
  })
})

watch(() => props.active, (active) => {
  if (active) void load(true)
}, { immediate: true })

watch(() => props.accountId, (_, previous) => {
  statusRequest++
  if (previous) selected.value = []
  accountImportedKeys.value = []
  hasImportStatus.value = false
  checkingStatus.value = false
  statusUnavailable.value = false
  outcomes.value = {}
})

watch([() => props.active, () => props.accountId], ([active]) => {
  if (active) void refreshImportStatus()
}, { immediate: true })

function toggle(row: VaLetterIndexRow, checked: boolean | 'indeterminate') {
  selected.value = checked === true ? [...new Set([...selected.value, key(row)])] : selected.value.filter(value => value !== key(row))
}

function toggleAll(checked: boolean | 'indeterminate') {
  selected.value = checked === true ? selectableLetters.value.map(key) : []
}

function recordOutcome(outcome: LetterImportOutcome) {
  outcomes.value[key(outcome.row)] = { ok: outcome.ok, message: outcome.message }
  if (outcome.ok && props.accountId) {
    statusRequest++
    checkingStatus.value = false
    const keys = [...imported.value]
    applyImportStatus(keys)
    void cacheImportedDecisionLetterKeys(props.accountId, keys)
  }
}

defineExpose({ selectedLetters, recordOutcome })
</script>

<template>
  <section class="space-y-3 py-2" aria-labelledby="letters-heading">
    <h2 id="letters-heading" class="font-semibold text-highlighted">Decision letters</h2>
    <p class="text-sm text-muted">Letters already in your VCH library are checked off. Select any remaining letters to import.</p>
    <div class="flex flex-wrap gap-2">
      <UButton :loading="manualRefresh || (loading && !loaded)" :disabled="loading" icon="i-lucide-refresh-cw" @click="load()">{{ loaded ? 'Refresh letters' : 'Find decision letters' }}</UButton>
      <div class="flex items-center gap-2">
        <UButton v-if="letters.length" color="success" icon="i-lucide-cloud-upload" :disabled="!selectedLetters.length || waitingForImportStatus || busy" @click="$emit('import')">Import to VCH</UButton>
        <UButton variant="outline" :to="VA_CLAIM_LETTERS_PAGE" target="_blank" rel="noopener noreferrer">Open VA.gov</UButton>
      </div>
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-if="waitingForImportStatus" role="status" class="text-sm text-muted">Checking your VCH library…</p>
    <p v-else-if="statusUnavailable" class="text-sm text-muted">Could not check your VCH library. Refresh letters to try again.</p>
    <p v-if="lastSyncedLabel" class="text-xs text-muted">Last Synced · {{ lastSyncedLabel }}</p>
    <p v-else-if="cacheWriteFailed" class="text-sm text-muted">You can import these letters now. The list could not be saved for offline use.</p>
    <p v-if="loaded && !letters.length" class="text-sm text-muted">No decision letters in this list. If you expect a letter, check the claim letters page on VA.gov.</p>
    <div v-if="selectableLetters.length" class="flex flex-wrap items-center justify-between gap-2">
      <UCheckbox :model-value="selectAllState" :disabled="busy || waitingForImportStatus" :label="selectAllLabel" :aria-label="selectAllLabel" @update:model-value="toggleAll" />
      <p class="text-sm text-muted">{{ selectedLetters.length }} of {{ selectableLetters.length }} selected</p>
    </div>
    <div v-for="row in letters" :key="key(row)" class="space-y-2 rounded-lg border border-default p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <UCheckbox :model-value="imported.has(key(row)) || selected.includes(key(row))" :disabled="busy || waitingForImportStatus || imported.has(key(row))" :label="row.documentTypeLabel || (row.document_type === '27' ? 'Appeal decision' : 'Claim decision or notification')" @update:model-value="toggle(row, $event)" />
        <UBadge v-if="imported.has(key(row))" color="success" variant="soft" icon="i-lucide-circle-check">On VCH</UBadge>
        <UBadge v-else-if="statusUnavailable && localReceipts.has(key(row))" color="neutral" variant="soft">Imported on this device</UBadge>
      </div>
      <p class="pl-6 text-xs text-muted">{{ row.letterDate?.slice(0, 10) || 'Date not provided by VA' }}</p>
      <p v-if="outcomes[key(row)]?.ok === false" role="status" class="text-sm text-error">{{ outcomes[key(row)]!.message }}</p>
    </div>
  </section>
</template>
