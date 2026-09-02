<script setup lang="ts">
import { VA_CLAIMS_PAGE, VA_SIGN_IN_PAGE } from '@/shared/vaEndpoints'
import {
  fetchVaClaimDetail,
  fetchVaClaimsList,
  formatVaDate,
  unwrapVaData
} from '@/shared/vaClient'
import {
  formatVaDateRange,
  mergeClaimDetail,
  parseVaClaim,
  type ParsedVaClaim
} from '@/shared/vaClaimParse'
import { readVaDeviceCache, saveVaClaimsCache } from '@/shared/vaDeviceCache'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const loading = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const claims = ref<ParsedVaClaim[]>([])
const expandedId = ref<string | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const loadedDetailIds = ref<Set<string>>(new Set())

async function hydrateClaimsFromDevice() {
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
  if (!cache.claims.length) return false
  claims.value = cache.claims
  return true
}

async function loadClaims() {
  loading.value = true
  error.value = null
  expandedId.value = null
  loadedDetailIds.value = new Set()

  const response = await fetchVaClaimsList()
  loading.value = false

  if (!response.ok) {
    const restored = await hydrateClaimsFromDevice()
    if (restored) {
      isStale.value = true
      error.value = null
      return
    }
    isStale.value = false
    error.value = response.error
    claims.value = []
    return
  }

  const list = unwrapVaData<unknown[]>(response.data) || []
  claims.value = list
    .map(item => parseVaClaim(item))
    .filter(Boolean) as ParsedVaClaim[]

  isStale.value = false
  await saveVaClaimsCache(claims.value)
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
}

function claimById(id: string) {
  return claims.value.find(claim => claim.id === id) ?? null
}

async function toggleDetail(claimId: string) {
  if (expandedId.value === claimId) {
    expandedId.value = null
    return
  }

  expandedId.value = claimId
  detailError.value = null

  const existing = claimById(claimId)
  if (!existing || loadedDetailIds.value.has(claimId)) return

  detailLoading.value = true
  const response = await fetchVaClaimDetail(claimId)
  detailLoading.value = false

  if (!response.ok) {
    detailError.value = response.error
    return
  }

  const index = claims.value.findIndex(claim => claim.id === claimId)
  if (index === -1) return

  claims.value[index] = mergeClaimDetail(claims.value[index], response.data)
  loadedDetailIds.value.add(claimId)
  await saveVaClaimsCache(claims.value)
}

function openVaSignIn() {
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

function openVaClaims() {
  void browser.tabs.create({ url: VA_CLAIMS_PAGE })
}

onMounted(async () => {
  await hydrateClaimsFromDevice()
  void loadClaims()
})
</script>

<template>
  <div class="flex flex-col gap-3 pb-1">
    <div class="flex items-center justify-between gap-2">
      <p class="font-medium text-sm text-highlighted">
        Your VA claims
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        aria-label="Refresh claims"
        @click="loadClaims"
      />
    </div>

    <VaStaleSyncBanner
      v-if="isStale"
      :last-synced-at="lastSyncedAt"
      @sign-in="openVaSignIn"
    />

    <UAlert
      v-if="error && !claims.length"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="error"
      description="Open your VA claims list in this browser first, then refresh here. Ratings and Appeals may work before that. Data stays in your browser — VCH does not store your VA password."
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
        <UButton size="xs" color="primary" variant="soft" label="Open claims page" @click="openVaClaims" />
      </template>
    </UAlert>

    <div v-if="loading && !claims.length" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <div v-else-if="!claims.length && !error && !isStale" class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center">
      <p class="text-muted text-sm">
        No claims returned. If you have open claims, sign in at VA.gov and visit your claims list first.
      </p>
      <UButton block size="sm" color="primary" label="Open VA.gov claims" @click="openVaClaims" />
    </div>

    <ul v-if="claims.length" class="space-y-2">
      <li
        v-for="claim in claims"
        :key="claim.id"
        class="rounded-lg border border-default bg-elevated/40"
      >
        <button
          type="button"
          class="flex w-full items-start gap-3 p-3 text-left"
          @click="toggleDetail(claim.id)"
        >
          <UIcon
            :name="expandedId === claim.id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="mt-0.5 size-4 shrink-0 text-muted"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-sm text-highlighted">{{ claim.title }}</span>
            <span class="block text-muted text-xs">{{ claim.statusLabel }}</span>
            <span v-if="claim.phaseLabel && claim.phaseLabel !== '—'" class="block text-muted text-xs">
              Phase: {{ claim.phaseLabel }}
            </span>
            <span v-if="claim.claimDate" class="block text-muted text-xs">
              Filed: {{ formatVaDate(claim.claimDate) }}
            </span>
          </span>
        </button>

        <div v-if="expandedId === claim.id" class="space-y-3 border-t border-default px-3 pb-3 pt-2">
          <div v-if="detailLoading" class="flex justify-center py-4">
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
          </div>
          <UAlert
            v-else-if="detailError"
            color="error"
            variant="soft"
            :title="detailError"
          />
          <template v-else>
            <dl class="grid gap-2 text-xs">
              <div class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Status
                </dt>
                <dd class="text-highlighted">
                  {{ claim.statusLabel }}
                </dd>
              </div>
              <div v-if="claim.phaseLabel !== '—'" class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Current phase
                </dt>
                <dd class="text-highlighted">
                  {{ claim.phaseLabel }}
                  <span v-if="claim.phaseChangeDate" class="text-muted">
                    · {{ formatVaDate(claim.phaseChangeDate) }}
                  </span>
                </dd>
              </div>
              <div v-if="claim.claimDate" class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Filed
                </dt>
                <dd class="text-highlighted">
                  {{ formatVaDate(claim.claimDate) }}
                </dd>
              </div>
              <div v-if="claim.minEstClaimDate || claim.maxEstClaimDate" class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Est. completion
                </dt>
                <dd class="text-highlighted">
                  {{ formatVaDateRange(claim.minEstClaimDate, claim.maxEstClaimDate) }}
                </dd>
              </div>
              <div v-if="claim.jurisdiction" class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Jurisdiction
                </dt>
                <dd class="text-highlighted">
                  {{ claim.jurisdiction }}
                  <span v-if="claim.tempJurisdiction" class="text-muted">({{ claim.tempJurisdiction }})</span>
                </dd>
              </div>
              <div class="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt class="font-medium text-muted">
                  Type code
                </dt>
                <dd class="text-highlighted">
                  {{ claim.claimTypeCode }}
                </dd>
              </div>
            </dl>

            <div v-if="claim.contentions.length" class="space-y-1.5">
              <p class="font-medium text-xs text-highlighted">
                Contentions
              </p>
              <ul class="space-y-1">
                <li
                  v-for="(contention, index) in claim.contentions"
                  :key="`${claim.id}-contention-${index}`"
                  class="rounded-md border border-default/70 bg-default/20 px-2 py-1.5 text-xs text-highlighted"
                >
                  {{ contention.name }}
                </li>
              </ul>
            </div>

            <div v-if="claim.previousPhases.length" class="space-y-1.5">
              <p class="font-medium text-xs text-highlighted">
                Phase history
              </p>
              <ul class="space-y-1">
                <li
                  v-for="(phase, index) in claim.previousPhases"
                  :key="`${claim.id}-phase-${index}`"
                  class="flex justify-between gap-2 text-xs"
                >
                  <span class="text-muted">{{ phase.label }}</span>
                  <span class="text-highlighted">{{ formatVaDate(phase.date) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="claim.supportingDocuments.length" class="space-y-1.5">
              <p class="font-medium text-xs text-highlighted">
                Documents
              </p>
              <ul class="space-y-1">
                <li
                  v-for="(doc, index) in claim.supportingDocuments"
                  :key="`${claim.id}-doc-${index}`"
                  class="rounded-md border border-default/70 bg-default/20 px-2 py-1.5 text-xs"
                >
                  <span class="block text-highlighted">{{ doc.documentTypeLabel || doc.originalFileName }}</span>
                  <span v-if="doc.uploadDate" class="text-muted">{{ formatVaDate(doc.uploadDate) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="claim.documentsNeeded || claim.developmentLetterSent || claim.decisionLetterSent" class="flex flex-wrap gap-1.5">
              <UBadge v-if="claim.documentsNeeded" color="warning" variant="soft" size="sm">
                Documents needed
              </UBadge>
              <UBadge v-if="claim.developmentLetterSent" color="neutral" variant="soft" size="sm">
                Development letter sent
              </UBadge>
              <UBadge v-if="claim.decisionLetterSent" color="primary" variant="soft" size="sm">
                Decision letter sent
              </UBadge>
            </div>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>
