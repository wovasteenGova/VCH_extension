<script setup lang="ts">
import { decisionLetterKey as key, fetchVaDecisionLetterIndex, type VaLetterIndexRow } from '@/shared/vaClaimLetters'
import type { LetterImportOutcome } from '@/shared/vaProfileImport'
import { VA_CLAIM_LETTERS_PAGE } from '@/shared/vaEndpoints'
import { checkVaCacheEpoch, readVaDeviceCache, saveVaLettersCache, VA_CACHE_OWNER_KEY, VA_DEVICE_CACHE_STORAGE_KEY } from '@/shared/vaDeviceCache'

const props = defineProps<{ active: boolean, busy: boolean, accountId: string | null, importedLetterKeys: string[] }>()
defineEmits<{ import: [] }>()
const letters = ref<VaLetterIndexRow[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const loaded = ref(false)
const listSource = ref<'live' | 'saved' | 'live-only'>('live')
const error = ref('')
const outcomes = ref<Record<string, { ok: boolean, message: string }>>({})
const toast = useToast()
const imported = computed(() => new Set(props.importedLetterKeys))
const selectedLetters = computed(() => letters.value.filter(row => selected.value.includes(key(row))))
const selectAllState = computed(() => selected.value.length === 0 ? false : selected.value.length === letters.value.length ? true : 'indeterminate' as const)

function applyLetters(rows: VaLetterIndexRow[]) {
  const nextKeys = new Set(rows.map(key))
  letters.value = rows
  selected.value = selected.value.filter(value => nextKeys.has(value))
  loaded.value = true
}

async function load(automatic = false) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    if (!loaded.value) {
      const saved = (await readVaDeviceCache()).letters
      if (saved) {
        applyLetters(saved.rows)
        listSource.value = 'saved'
      }
    }
    const { rows: next, ownerEpoch } = await fetchVaDecisionLetterIndex()
    const saved = ownerEpoch ? await saveVaLettersCache(next, ownerEpoch) : false
    if (ownerEpoch && !await checkVaCacheEpoch(ownerEpoch)) {
      throw new Error('Your VA.gov account changed. Refresh the letter list and try again.')
    }
    const previousKeys = new Set(letters.value.map(key))
    applyLetters(next)
    listSource.value = saved ? 'live' : 'live-only'
    if (next.length && (!automatic || next.some(row => !previousKeys.has(key(row))))) {
      toast.add({ title: `${next.length} decision letter${next.length === 1 ? '' : 's'} available`, description: 'Select the letters you want to save to your VCH account.', color: 'success' })
    }
  } catch (caught) {
    if (loaded.value) {
      if (listSource.value !== 'live-only') listSource.value = 'saved'
      return
    }
    error.value = caught instanceof Error ? caught.message : 'Could not read VA decision letters.'
    if (!automatic) toast.add({ title: 'Could not find decision letters', description: error.value, color: 'error' })
  } finally { loading.value = false }
}

onMounted(() => {
  const onCacheChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const cache = changes[VA_DEVICE_CACHE_STORAGE_KEY]
    if (!changes[VA_CACHE_OWNER_KEY] && !(cache && !cache.newValue)) return
    letters.value = []
    selected.value = []
    outcomes.value = {}
    loaded.value = false
    listSource.value = 'live'
  }
  browser.storage.onChanged.addListener(onCacheChanged)
  onUnmounted(() => browser.storage.onChanged.removeListener(onCacheChanged))
})

watch(() => props.active, (active) => {
  if (active) void load(true)
}, { immediate: true })

watch(() => props.accountId, (_, previous) => {
  if (previous) selected.value = []
  outcomes.value = {}
})

function toggle(row: VaLetterIndexRow, checked: boolean | 'indeterminate') {
  selected.value = checked === true ? [...new Set([...selected.value, key(row)])] : selected.value.filter(value => value !== key(row))
}

function toggleAll(checked: boolean | 'indeterminate') {
  selected.value = checked === true ? letters.value.map(key) : []
}

function recordOutcome(outcome: LetterImportOutcome) {
  outcomes.value[key(outcome.row)] = { ok: outcome.ok, message: outcome.message }
  if (outcome.ok) selected.value = selected.value.filter(value => value !== key(outcome.row))
}

defineExpose({ selectedLetters, recordOutcome })
</script>

<template>
  <section class="space-y-3 py-2" aria-labelledby="letters-heading">
    <h2 id="letters-heading" class="font-semibold text-highlighted">Decision letters</h2>
    <p class="text-sm text-muted">Choose one letter or select all, then import your selection to your private VCH library.</p>
    <div class="flex flex-wrap gap-2">
      <UButton :loading="loading" :disabled="busy" icon="i-lucide-refresh-cw" @click="load()">{{ loaded ? 'Refresh letters' : 'Find decision letters' }}</UButton>
      <div class="flex items-center gap-2">
        <UButton v-if="letters.length" color="success" icon="i-lucide-cloud-upload" :disabled="!selected.length || loading || busy" @click="$emit('import')">Import to VCH</UButton>
        <UButton variant="outline" :disabled="busy" :to="VA_CLAIM_LETTERS_PAGE" target="_blank" rel="noopener noreferrer">Open VA.gov</UButton>
      </div>
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-if="listSource === 'saved'" class="text-sm text-muted">Showing the saved letter list. Open VA.gov if you need to refresh or sign in before importing.</p>
    <p v-else-if="listSource === 'live-only'" class="text-sm text-muted">You can import these letters now. The list could not be saved for offline use.</p>
    <p v-if="loaded && !letters.length" class="text-sm text-muted">No decision letters in this list. If you expect a letter, check the claim letters page on VA.gov.</p>
    <div v-if="letters.length" class="flex flex-wrap items-center justify-between gap-2">
      <UCheckbox :model-value="selectAllState" :disabled="busy" label="Select all letters" @update:model-value="toggleAll" />
      <p class="text-sm text-muted">{{ selected.length }} of {{ letters.length }} selected</p>
    </div>
    <div v-for="row in letters" :key="key(row)" class="space-y-2 rounded-lg border border-default p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <UCheckbox :model-value="selected.includes(key(row))" :disabled="busy" :label="row.documentTypeLabel || (row.document_type === '27' ? 'Appeal decision' : 'Claim decision or notification')" @update:model-value="toggle(row, $event)" />
        <UBadge v-if="imported.has(key(row)) || outcomes[key(row)]?.ok" color="success" variant="soft" icon="i-lucide-circle-check" title="VCH confirmed an import from this device">Imported</UBadge>
      </div>
      <p class="pl-6 text-xs text-muted">{{ row.letterDate?.slice(0, 10) || 'Date not provided by VA' }}</p>
      <p v-if="outcomes[key(row)]?.ok === false" role="status" class="text-sm text-error">{{ outcomes[key(row)]!.message }}</p>
    </div>
  </section>
</template>
