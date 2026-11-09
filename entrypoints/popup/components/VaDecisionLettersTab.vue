<script setup lang="ts">
import { listVaDecisionLetters, type VaLetterIndexRow } from '@/shared/vaClaimLetters'
import type { LetterImportOutcome } from '@/shared/vaProfileImport'
import { openVaClaimsPage } from '@/shared/vaSignInNavigation'

const props = defineProps<{ active: boolean }>()
const letters = ref<VaLetterIndexRow[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const outcomes = ref<Record<string, { ok: boolean, message: string }>>({})
const toast = useToast()
const key = (row: VaLetterIndexRow) => `${row.documentUuid}:${row.document_type}`
const selectedLetters = computed(() => letters.value.filter(row => selected.value.includes(key(row))))
const selectAllState = computed(() => selected.value.length === 0 ? false : selected.value.length === letters.value.length ? true : 'indeterminate' as const)

async function load(automatic = false) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const next = await listVaDecisionLetters()
    const previousKeys = new Set(letters.value.map(key))
    const nextKeys = new Set(next.map(key))
    letters.value = next
    selected.value = selected.value.filter(value => nextKeys.has(value))
    loaded.value = true
    if (next.length && (!automatic || next.some(row => !previousKeys.has(key(row))))) {
      toast.add({ title: `${next.length} decision letter${next.length === 1 ? '' : 's'} available`, description: 'Select the letters you want to save to your VCH account.', color: 'success' })
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not read VA decision letters.'
    if (!automatic) toast.add({ title: 'Could not find decision letters', description: error.value, color: 'error' })
  } finally { loading.value = false }
}

watch(() => props.active, (active) => {
  if (active) void load(true)
}, { immediate: true })

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
    <p class="text-sm text-muted">Choose the PDFs you want to save, then open Sync Approved above to save them to your VCH account.</p>
    <div class="flex flex-wrap gap-2">
      <UButton :loading="loading" icon="i-lucide-refresh-cw" @click="load()">{{ loaded ? 'Refresh letters' : 'Find decision letters' }}</UButton>
      <UButton variant="outline" @click="openVaClaimsPage">Open VA.gov</UButton>
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-if="loaded && !letters.length" class="text-sm text-muted">VA.gov returned no decision letters. This is separate from benefit verification letters. If you expect a letter, check VA.gov’s claim letters page.</p>
    <div v-if="letters.length" class="flex flex-wrap items-center justify-between gap-2">
      <UCheckbox :model-value="selectAllState" label="Select all letters" @update:model-value="toggleAll" />
      <p class="text-sm text-muted">{{ selected.length }} of {{ letters.length }} selected</p>
    </div>
    <div v-for="row in letters" :key="key(row)" class="space-y-2 rounded-lg border border-default p-3">
      <UCheckbox :model-value="selected.includes(key(row))" :label="row.documentTypeLabel || (row.document_type === '27' ? 'Appeal decision' : 'Claim decision or notification')" @update:model-value="toggle(row, $event)" />
      <p class="pl-6 text-xs text-muted">{{ row.letterDate?.slice(0, 10) || 'Date not provided by VA' }}</p>
      <p v-if="outcomes[key(row)]" role="status" class="text-sm" :class="outcomes[key(row)]!.ok ? 'text-success' : 'text-error'">{{ outcomes[key(row)]!.message }}</p>
    </div>
  </section>
</template>
