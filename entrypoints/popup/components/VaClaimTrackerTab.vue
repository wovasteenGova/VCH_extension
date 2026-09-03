<script setup lang="ts">
import { openVaClaimsPage } from '@/shared/vaSignInNavigation'
import {
  fetchVaClaimDetail,
  fetchVaClaimsList,
  formatVaDate,
  unwrapVaList
} from '@/shared/vaClient'
import {
  formatVaDateRange,
  mergeClaimDetail,
  mergeParsedClaims,
  parseVaClaim,
  type ParsedVaClaim
} from '@/shared/vaClaimParse'
import { probeVaSession } from '@/shared/connectionStatus'
import { isRecentVaDeviceSync, readVaDeviceCache, readVaCacheMeta, saveVaClaimsCache, subscribeVaDeviceCache } from '@/shared/vaDeviceCache'
import { hasOpenVaGovTab } from '@/shared/vaGovTabFetch'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const loading = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const hasClaimsCache = ref(false)
const hasOtherVaCache = ref(false)
const vaGovTabOpen = ref(false)
const vaLiveSession = ref(false)
const claims = ref<ParsedVaClaim[]>([])
const expandedId = ref<string | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const loadedDetailIds = ref<Set<string>>(new Set())

function markCacheFreshIfPossible() {
  if (vaLiveSession.value || vaGovTabOpen.value || isRecentVaDeviceSync(lastSyncedAt.value)) {
    isStale.value = false
  }
}

async function refreshDeviceCacheMeta() {
  const meta = await readVaCacheMeta()
  hasClaimsCache.value = meta.hasClaims
  hasOtherVaCache.value = meta.hasAny && !meta.hasClaims
  lastSyncedAt.value = meta.lastSyncedAt
  vaGovTabOpen.value = await hasOpenVaGovTab()
  markCacheFreshIfPossible()
}

async function hydrateClaimsFromDevice() {
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
  hasClaimsCache.value = cache.claims.length > 0
  if (!cache.claims.length) return false
  claims.value = cache.claims
  return true
}

const showSignInWall = computed(() =>
  Boolean(
    error.value
    && !claims.value.length
    && !isStale.value
    && !hasClaimsCache.value
    && !hasOtherVaCache.value
  )
)

const showClaimsNotSyncedInfo = computed(() =>
  !claims.value.length && !isStale.value && !hasClaimsCache.value && hasOtherVaCache.value
)

const showCachedClaimsRestoreHint = computed(() =>
  hasClaimsCache.value && !claims.value.length && !isStale.value
)

const claimsErrorDescription = computed(() => {
  if (!vaGovTabOpen.value) {
    return 'No claims saved on this device yet. Open Track claims on VA.gov in this browser, sign in, let your list load, then refresh here or use the VCH bar at the bottom of that page.'
  }

  return 'VA.gov is open, but claims are not authorized yet. Open Track claims, wait for your list to load, then refresh here or tap Sync on the VCH bar at the bottom of that page.'
})

const claimsNotSyncedDescription = computed(() => {
  if (hasClaimsCache.value) {
    return 'Claims are saved on this device but did not load in this view yet. Tap the restore icon next to refresh, or open Track claims on VA.gov and sync again.'
  }
  return 'Ratings or appeals are saved on this device, but claims have not synced yet. Open Track claims on VA.gov in this browser, wait for your list to load, then tap Sync on the VCH bar at the bottom of that page.'
})

async function restoreClaimsFromDevice() {
  const restored = await hydrateClaimsFromDevice()
  await refreshDeviceCacheMeta()
  if (restored || claims.value.length > 0) {
    applyCachedClaims(claims.value)
  }
  return restored || claims.value.length > 0
}

function applyCachedClaims(fallbackClaims: ParsedVaClaim[]) {
  if (!fallbackClaims.length) return false
  claims.value = fallbackClaims
  error.value = null
  isStale.value = !(vaLiveSession.value || vaGovTabOpen.value || isRecentVaDeviceSync(lastSyncedAt.value))
  return true
}

async function loadClaims() {
  const cacheBefore = await readVaDeviceCache()
  const cachedClaims = cacheBefore.claims.length
    ? cacheBefore.claims
    : (claims.value.length ? [...claims.value] : [])

  loading.value = true
  // Keep cached rows visible while refreshing; only clear errors when we have cache.
  if (cachedClaims.length) {
    lastSyncedAt.value = cacheBefore.lastSyncedAt
    applyCachedClaims(cachedClaims)
  } else {
    error.value = null
    expandedId.value = null
    loadedDetailIds.value = new Set()
  }

  try {
    const response = await fetchVaClaimsList()
    loading.value = false

    if (!response.ok) {
      await refreshDeviceCacheMeta()
      if (applyCachedClaims(cachedClaims) || (await hydrateClaimsFromDevice())) {
        return
      }
      isStale.value = false
      error.value = response.error
      claims.value = []
      return
    }

    const parsed = unwrapVaList(response.data)
      .map(item => parseVaClaim(item))
      .filter(Boolean) as ParsedVaClaim[]
    const merged = mergeParsedClaims(cachedClaims, parsed)

    if (merged.length === 0) {
      await refreshDeviceCacheMeta()
      if (applyCachedClaims(cachedClaims) || (await hydrateClaimsFromDevice())) {
        return
      }
      isStale.value = false
      error.value = null
      claims.value = []
      return
    }

    claims.value = merged
    isStale.value = false
    error.value = null
    vaLiveSession.value = true
    const saved = await saveVaClaimsCache(merged)
    if (!saved) {
      error.value = 'Loaded claims from VA.gov but could not save them on this device.'
    }
    await refreshDeviceCacheMeta()
  } catch {
    loading.value = false
    await refreshDeviceCacheMeta()
    if (!(applyCachedClaims(cachedClaims) || (await hydrateClaimsFromDevice()))) {
      error.value = 'Could not read claims from VA.gov.'
    }
  }
}

async function bootstrapClaims() {
  const session = await probeVaSession()
  vaLiveSession.value = session.connected
  await refreshDeviceCacheMeta()
  const restored = await hydrateClaimsFromDevice()
  if (restored) {
    error.value = null
    markCacheFreshIfPossible()
    if (!vaLiveSession.value && !vaGovTabOpen.value && !isRecentVaDeviceSync(lastSyncedAt.value)) {
      isStale.value = true
    }
  }
  await loadClaims()
  if (!claims.value.length) {
    await restoreClaimsFromDevice()
  }
  await refreshDeviceCacheMeta()
}

onMounted(() => {
  const stop = subscribeVaDeviceCache((cache) => {
    lastSyncedAt.value = cache.lastSyncedAt
    if (cache.claims.length) applyCachedClaims(cache.claims)
    void refreshDeviceCacheMeta()
  })
  onUnmounted(stop)
  void bootstrapClaims()
})

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
  openVaClaimsPage()
}

function openVaClaims() {
  openVaClaimsPage()
}
</script>

<template>
  <div class="flex flex-col gap-3 pb-1">
    <div class="flex items-center justify-between gap-2">
      <p class="font-medium text-sm text-highlighted">
        Your VA claims
      </p>
      <div class="flex items-center gap-0.5">
        <UButton
          v-if="hasClaimsCache && !claims.length"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-hard-drive-download"
          aria-label="Restore saved claims"
          @click="restoreClaimsFromDevice"
        />
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
    </div>

    <VaStaleSyncBanner
      v-if="isStale"
      :last-synced-at="lastSyncedAt"
      :live-session="vaLiveSession || vaGovTabOpen"
      @sign-in="openVaSignIn"
    />

    <UAlert
      v-if="showClaimsNotSyncedInfo"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Claims not synced yet"
      :description="claimsNotSyncedDescription"
    >
      <template #actions>
        <UButton size="xs" color="primary" variant="soft" label="Open claims page" @click="openVaClaims" />
      </template>
    </UAlert>

    <UAlert
      v-else-if="showSignInWall"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="error || 'Could not load claims'"
      :description="claimsErrorDescription"
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
        <UButton size="xs" color="primary" variant="soft" label="Open claims page" @click="openVaClaims" />
      </template>
    </UAlert>

    <div v-if="loading && !claims.length" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <div
      v-else-if="!claims.length && !error && !isStale && !showClaimsNotSyncedInfo && !showSignInWall"
      class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center"
    >
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
          >
            <template #actions>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                label="Open Track claims"
                @click="openVaClaims"
              />
            </template>
          </UAlert>
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
