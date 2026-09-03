<script setup lang="ts">
import {
  buildClaimBuilderVaImportPayload,
  checkClaimBuilderVaImportSync,
  importVaRatingsToClaimBuilder
} from '@/shared/claimBuilderVaImport'
import { openHubSignIn, type ConnectionState } from '@/shared/connectionStatus'
import { readHubSession } from '@/shared/hubSessionRead'
import { VA_DISABILITY_RATING_PAGE } from '@/shared/vaEndpoints'
import { openVaSignIn } from '@/shared/vaSignInNavigation'
import { fetchVaRatedDisabilities, formatVaDate } from '@/shared/vaClient'
import { parseVaRatingsResponse, sortRatingsByPercent, type ParsedVaRating } from '@/shared/vaRatingParse'
import type { ParsedVaUserProfileForImport } from '@/shared/vaUserProfileParse'
import { hydrateVaProfileFromDevice, refreshVaProfileForImport } from '@/shared/vaUserProfileFetch'
import { buildVaImportPreviewItems, formatVaImportSuccessMessage } from '@/shared/vaImportPreview'
import { persistLiveVaCaches } from '@/shared/vaCacheSync'
import { readVaDeviceCache, saveVaRatingsCache } from '@/shared/vaDeviceCache'
import { CLAIMBUILDER_URL } from '@/shared/urls'
import {
  assessRatingsAvailability,
  refreshRatingsGateState,
  type RatingsAvailability
} from '@/shared/ratingsAvailability'
import { useRatingsPasskeyLock } from '../composables/useRatingsPasskeyLock'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const {
  unlocked,
  hasCredential,
  supported,
  busy: lockBusy,
  lockError,
  init,
  lock,
  setupLock,
  unlock,
  removeLock
} = useRatingsPasskeyLock()

const loading = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const rows = ref<ParsedVaRating[]>([])
const combinedRating = ref<number | null>(null)
const combinedEffectiveDate = ref<string | undefined>()
const importConsent = ref(false)
const importBusy = ref(false)
const importError = ref<string | null>(null)
const importSuccess = ref<string | null>(null)
const importPanelExpanded = ref(false)
const importPreviewExpanded = ref(false)
const claimBuilderSyncStatus = ref<'idle' | 'checking' | 'synced' | 'out_of_sync'>('idle')
const claimBuilderSyncedAt = ref<string | null>(null)
let claimBuilderSyncCheckToken = 0
const hubSession = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const hubCanImport = ref(false)
const vaSession = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const importProfilePreview = ref<ParsedVaUserProfileForImport | null>(null)
const gateChecking = ref(true)
const hasCachedRatings = ref(false)
const ratingsGate = ref<RatingsAvailability>({
  available: false,
  reason: 'va_sign_in',
  message: 'Sign in to VA.gov before protecting or viewing disability ratings.'
})

const canUsePasskeyGate = computed(() => ratingsGate.value.available)

const gateMessage = computed(() => {
  if (ratingsGate.value.available) return ''
  return ratingsGate.value.message
})

const emptyUnlockedMessage = computed(() => {
  if (!vaSession.value.connected && !hasCachedRatings.value) {
    return 'You unlocked ratings, but VA.gov is not signed in on this browser and nothing is saved on this device yet.'
  }
  if (error.value) return error.value
  return 'No disability ratings loaded. Open your disability rating on VA.gov, then refresh here.'
})

const hasRatingsData = computed(() => combinedRating.value != null || rows.value.length > 0)

const hasProfilePreviewData = computed(() => {
  const profile = importProfilePreview.value
  if (!profile) return false
  return Boolean(
    profile.dateOfBirth
    || profile.phone
    || profile.fullName
    || profile.lastFourSsn
    || profile.servicePeriods?.length
  )
})

const importPreviewItems = computed(() => buildVaImportPreviewItems({
  combinedRating: combinedRating.value,
  combinedEffectiveDate: combinedEffectiveDate.value,
  rows: rows.value,
  profile: importProfilePreview.value
}))

const currentImportPayload = computed(() => buildClaimBuilderVaImportPayload({
  combinedRating: combinedRating.value,
  combinedEffectiveDate: combinedEffectiveDate.value,
  rows: rows.value,
  profile: importProfilePreview.value
}))

const showCollapsedClaimBuilderSync = computed(() =>
  claimBuilderSyncStatus.value === 'synced'
  && !importPanelExpanded.value
  && hubCanImport.value
  && hasRatingsData.value
)

const showClaimBuilderImportPanel = computed(() =>
  (combinedRating.value != null || rows.value.length)
  && !showCollapsedClaimBuilderSync.value
)

async function refreshClaimBuilderSyncStatus() {
  if (!unlocked.value || !hasRatingsData.value) {
    if (claimBuilderSyncStatus.value !== 'synced') {
      claimBuilderSyncStatus.value = 'idle'
      claimBuilderSyncedAt.value = null
    }
    return
  }

  if (!hubCanImport.value) {
    return
  }

  const token = ++claimBuilderSyncCheckToken
  claimBuilderSyncStatus.value = 'checking'

  const status = await checkClaimBuilderVaImportSync(currentImportPayload.value)
  if (token !== claimBuilderSyncCheckToken) return

  if (!status.checked) {
    claimBuilderSyncStatus.value = claimBuilderSyncStatus.value === 'synced'
      ? 'synced'
      : 'idle'
    return
  }

  claimBuilderSyncStatus.value = status.synced ? 'synced' : 'out_of_sync'
  claimBuilderSyncedAt.value = status.importedAt
  if (status.synced) {
    importPanelExpanded.value = false
    importPreviewExpanded.value = false
  }
}

function markClaimBuilderSynced(importedAt?: string | null) {
  claimBuilderSyncStatus.value = 'synced'
  claimBuilderSyncedAt.value = importedAt ?? new Date().toISOString()
  importPanelExpanded.value = false
  importPreviewExpanded.value = false
}

function expandClaimBuilderImportPanel() {
  importPanelExpanded.value = true
  importSuccess.value = null
}

async function refreshImportProfilePreview() {
  const previous = importProfilePreview.value
  const next = await refreshVaProfileForImport()
  importProfilePreview.value = next ?? previous ?? await hydrateVaProfileFromDevice()
}

async function refreshRatingsAndProfile() {
  await Promise.all([loadRatings(), refreshImportProfilePreview()])
  void refreshClaimBuilderSyncStatus()
}

async function refreshHubSession() {
  const session = await readHubSession()
  hubSession.value = {
    connected: session.connected,
    label: session.label
  }
  hubCanImport.value = session.canImport
  if (session.canImport && importError.value?.toLowerCase().includes('sign in')) {
    importError.value = null
  }
  void refreshClaimBuilderSyncStatus()
}

async function refreshRatingsGate() {
  gateChecking.value = true
  const gate = await refreshRatingsGateState()
  vaSession.value = gate.vaSession
  hasCachedRatings.value = gate.hasCachedRatings
  ratingsGate.value = gate.availability
  gateChecking.value = false
}

async function handleSetupLock() {
  lockError.value = null
  const availability = await assessRatingsAvailability()
  ratingsGate.value = availability
  if (!availability.available) {
    lockError.value = availability.message
    return
  }
  await setupLock()
}

async function handleUnlock() {
  lockError.value = null

  if (!hasCachedRatings.value) {
    const availability = await assessRatingsAvailability()
    ratingsGate.value = availability
    if (!availability.available) {
      lockError.value = availability.message
      return
    }
  }

  await unlock()
}

function clearRatingsDisplay() {
  error.value = null
  isStale.value = false
  rows.value = []
  combinedRating.value = null
  combinedEffectiveDate.value = undefined
  importConsent.value = false
  importError.value = null
  importSuccess.value = null
  importPanelExpanded.value = false
  claimBuilderSyncStatus.value = 'idle'
  claimBuilderSyncedAt.value = null
}

async function hydrateRatingsFromDevice() {
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
  if (!cache.ratings) return false
  combinedRating.value = cache.ratings.combinedRating
  combinedEffectiveDate.value = cache.ratings.combinedEffectiveDate
  rows.value = sortRatingsByPercent(cache.ratings.rows)
  return cache.ratings.rows.length > 0 || cache.ratings.combinedRating != null
}

async function loadRatings() {
  if (!unlocked.value) return

  loading.value = true
  error.value = null

  const response = await fetchVaRatedDisabilities()
  loading.value = false

  if (!response.ok) {
    const restored = await hydrateRatingsFromDevice()
    hasCachedRatings.value = restored
    if (restored || hasRatingsData.value) {
      isStale.value = !vaSession.value.connected
      error.value = null
      return
    }
    isStale.value = false
    error.value = response.error
    clearRatingsDisplay()
    void refreshRatingsGate()
    return
  }

  const summary = parseVaRatingsResponse(response.data)
  combinedRating.value = summary.combinedRating
  combinedEffectiveDate.value = summary.combinedEffectiveDate
  rows.value = sortRatingsByPercent(summary.ratings)
  isStale.value = false

  await saveVaRatingsCache({
    combinedRating: combinedRating.value,
    combinedEffectiveDate: combinedEffectiveDate.value,
    rows: rows.value
  })
  hasCachedRatings.value = true
  ratingsGate.value = { available: true, source: 'live' }
  await persistLiveVaCaches()
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
}

function openVaDisabilityRating() {
  void browser.tabs.create({ url: VA_DISABILITY_RATING_PAGE })
}

function openClaimBuilder(syncAfterImport = false) {
  const base = CLAIMBUILDER_URL.replace(/\/$/, '')
  const url = syncAfterImport ? `${base}/?vchVaSync=1` : base
  void browser.tabs.create({ url })
}

async function populateClaimBuilderSettings() {
  if (!importConsent.value || importBusy.value) return
  if (!rows.value.length && combinedRating.value == null) return

  importBusy.value = true
  importError.value = null
  importSuccess.value = null

  try {
    await refreshHubSession()
    if (!hubCanImport.value) {
      throw new Error(`Sign in at veteranscentralhub.com in this browser, then try again.`)
    }

    const userResponse = await refreshVaProfileForImport()
    const profile = userResponse

    const result = await importVaRatingsToClaimBuilder(
      buildClaimBuilderVaImportPayload({
        combinedRating: combinedRating.value,
        combinedEffectiveDate: combinedEffectiveDate.value,
        rows: rows.value,
        profile
      })
    )

    const applied = result.appliedToConditionIds.length
    importSuccess.value = formatVaImportSuccessMessage({
      appliedToConditionIds: result.appliedToConditionIds,
      appliedProfileFields: result.appliedProfileFields,
      conditionCount: result.conditionCount
    })
    markClaimBuilderSynced(result.importedAt)
    void refreshClaimBuilderSyncStatus()
    openClaimBuilder(true)
  } catch (caught) {
    importError.value = caught instanceof Error ? caught.message : 'Could not populate ClaimBuilder settings.'
    if (importError.value.toLowerCase().includes('sign in')) {
      await refreshHubSession()
    }
  } finally {
    importBusy.value = false
  }
}

function lockRatings() {
  lock()
  clearRatingsDisplay()
}

watch(unlocked, async (isUnlocked) => {
  if (isUnlocked) {
    const restored = await hydrateRatingsFromDevice()
    hasCachedRatings.value = restored
    if (restored) {
      isStale.value = !vaSession.value.connected
      error.value = null
    }
    importProfilePreview.value = await hydrateVaProfileFromDevice()
    void refreshHubSession()
    void refreshImportProfilePreview()
    void loadRatings()
    void refreshClaimBuilderSyncStatus()
  } else {
    clearRatingsDisplay()
    importProfilePreview.value = null
  }
})

watch(
  [rows, combinedRating, combinedEffectiveDate, importProfilePreview, hubCanImport],
  () => {
    void refreshClaimBuilderSyncStatus()
  },
  { deep: true }
)

onMounted(async () => {
  await Promise.all([init(), refreshHubSession(), refreshRatingsGate()])
})

onUnmounted(() => {
  lockRatings()
})
</script>

<template>
  <div class="flex flex-col gap-3 pb-1">
    <div class="flex items-center justify-between gap-2">
      <p class="font-medium text-sm text-highlighted">
        Rated disabilities
      </p>
      <div class="flex items-center gap-1">
        <UButton
          v-if="unlocked"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-lock"
          aria-label="Lock ratings"
          @click="lockRatings"
        />
        <UButton
          v-if="unlocked"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          aria-label="Refresh ratings"
          @click="refreshRatingsAndProfile"
        />
      </div>
    </div>

    <div
      v-if="gateChecking"
      class="flex items-center justify-center py-10"
    >
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <div
      v-else-if="!supported"
      class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center"
    >
      <UIcon name="i-lucide-fingerprint" class="mx-auto size-8 text-muted" />
      <p class="font-medium text-sm text-highlighted">
        Passkeys not available
      </p>
      <p class="text-muted text-xs leading-relaxed">
        Disability ratings stay hidden here. Use a browser that supports device passkeys (Edge or Chrome with Windows Hello).
      </p>
    </div>

    <div
      v-else-if="!canUsePasskeyGate"
      class="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-4"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-5 shrink-0 text-warning" />
        <div class="min-w-0 space-y-1">
          <p class="font-medium text-sm text-highlighted">
            VA ratings required first
          </p>
          <p class="text-muted text-xs leading-relaxed">
            {{ gateMessage }}
          </p>
          <p class="text-muted text-[0.65rem] leading-relaxed">
            Passkey protection is only offered once VA disability ratings exist on this device or VA.gov is linked in this browser.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <UButton
          v-if="!ratingsGate.available && ratingsGate.reason === 'va_sign_in'"
          block
          size="sm"
          color="primary"
          label="Sign in to VA.gov"
          @click="openVaSignIn"
        />
        <UButton
          v-if="!ratingsGate.available && ratingsGate.reason === 'no_ratings'"
          block
          size="sm"
          color="primary"
          label="Open disability rating"
          @click="openVaDisabilityRating"
        />
        <UButton
          block
          size="sm"
          color="neutral"
          variant="outline"
          label="Check again"
          @click="refreshRatingsGate"
        />
      </div>
    </div>

    <div
      v-else-if="!unlocked"
      class="space-y-3 rounded-lg border border-default bg-elevated/30 p-4"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-primary" />
        <div class="min-w-0 space-y-1">
          <p class="font-medium text-sm text-highlighted">
            {{ hasCredential ? 'Ratings are protected' : 'Protect your ratings' }}
          </p>
          <p class="text-muted text-xs leading-relaxed">
            {{ hasCredential
              ? 'Unlock with Windows Hello, a device passkey, or your browser saved passkey.'
              : 'Set up a passkey to hide ratings until you unlock them. Windows Hello, this device, or your browser saved passkey all work in Chrome and Edge.' }}
          </p>
        </div>
      </div>

      <p
        v-if="lockError"
        class="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs leading-relaxed text-red-500"
      >
        {{ lockError }}
      </p>

      <UButton
        block
        size="sm"
        color="primary"
        leading-icon="i-lucide-fingerprint"
        :loading="lockBusy"
        :label="hasCredential ? 'Unlock with passkey' : 'Set up passkey'"
        @click="hasCredential ? handleUnlock() : handleSetupLock()"
      />

      <button
        v-if="hasCredential"
        type="button"
        class="w-full text-center text-muted text-[0.65rem] underline-offset-2 hover:underline"
        :disabled="lockBusy"
        @click="removeLock"
      >
        Remove passkey protection on this device
      </button>
    </div>

    <template v-else>
      <VaStaleSyncBanner
        v-if="isStale"
        :last-synced-at="lastSyncedAt"
        @sign-in="openVaSignIn"
      />

      <UAlert
        v-if="error && !hasRatingsData"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="error"
        description="Open your disability rating on VA.gov in this browser, then refresh here."
      >
        <template #actions>
          <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
          <UButton size="xs" color="primary" variant="soft" label="Open disability rating" @click="openVaDisabilityRating" />
        </template>
      </UAlert>

      <div v-if="loading && !hasRatingsData" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
      </div>

      <div
        v-else-if="!hasRatingsData && !isStale"
        class="space-y-3 rounded-lg border border-dashed border-default p-4"
      >
        <div class="space-y-1 text-center">
          <p class="font-medium text-sm text-highlighted">
            No ratings to show
          </p>
          <p class="text-muted text-xs leading-relaxed">
            {{ emptyUnlockedMessage }}
          </p>
        </div>
        <UButton
          v-if="!vaSession.connected"
          block
          size="sm"
          color="primary"
          label="Sign in to VA.gov"
          @click="openVaSignIn"
        />
        <UButton
          block
          size="sm"
          :color="vaSession.connected ? 'primary' : 'neutral'"
          :variant="vaSession.connected ? 'solid' : 'outline'"
          label="Open disability rating"
          @click="openVaDisabilityRating"
        />
        <UButton
          block
          size="sm"
          color="neutral"
          variant="ghost"
          label="Refresh ratings"
          :loading="loading"
          @click="refreshRatingsAndProfile"
        />
        <UButton
          block
          size="sm"
          color="neutral"
          variant="soft"
          label="Lock ratings again"
          @click="lockRatings"
        />
      </div>

      <div v-else-if="hasRatingsData || isStale" class="space-y-3">
        <div
          v-if="combinedRating != null"
          class="rounded-lg border border-primary/30 bg-primary/10 p-3 text-center"
        >
          <p class="text-muted text-xs">
            Combined rating
          </p>
          <p class="font-semibold text-2xl text-highlighted">
            {{ combinedRating }}%
          </p>
          <p v-if="combinedEffectiveDate" class="mt-1 text-muted text-xs">
            Effective {{ formatVaDate(combinedEffectiveDate) }}
          </p>
        </div>

        <div
          v-if="showCollapsedClaimBuilderSync"
          class="rounded-lg border border-primary/30 bg-primary/10 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/15">
                <UIcon name="i-lucide-cloud-check" class="size-4 text-primary" />
              </span>
              <div class="min-w-0">
                <p class="font-medium text-xs text-highlighted">
                  Synced with ClaimBuilder
                </p>
                <p v-if="claimBuilderSyncedAt" class="truncate text-[0.65rem] text-muted">
                  Last populated {{ formatVaDate(claimBuilderSyncedAt) }}
                </p>
              </div>
            </div>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              label="Resync"
              @click="expandClaimBuilderImportPanel"
            />
          </div>
        </div>

        <div
          v-else-if="showClaimBuilderImportPanel"
          class="space-y-3 rounded-lg border border-default bg-elevated/30 p-3"
        >
          <div class="space-y-1">
            <p class="font-medium text-sm text-highlighted">
              Populate VCH settings with claim data
            </p>
            <p class="text-muted text-[0.65rem] leading-relaxed">
              With your approval, VCH sends the items below to your signed-in ClaimBuilder account. Data is stored on a secure third-party cloud service and used only to pre-fill Project settings and current ratings for increase claims.
            </p>
          </div>

          <div
            v-if="importPreviewItems.length"
            class="rounded-md border border-default/70 bg-default/40 p-2.5"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 text-left"
              @click="importPreviewExpanded = !importPreviewExpanded"
            >
              <span class="font-medium text-[0.65rem] text-highlighted">
                Will send to ClaimBuilder
                <span class="font-normal text-muted">({{ importPreviewItems.length }})</span>
              </span>
              <UIcon
                :name="importPreviewExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-3.5 shrink-0 text-muted"
              />
            </button>
            <div v-show="importPreviewExpanded" class="mt-1.5 space-y-1.5">
              <ul class="max-h-36 space-y-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <li
                  v-for="item in importPreviewItems"
                  :key="item.id"
                  class="text-[0.65rem] leading-snug text-muted"
                >
                  <span class="font-medium text-highlighted">{{ item.label }}</span>
                  <span v-if="item.detail"> — {{ item.detail }}</span>
                </li>
              </ul>
              <p class="text-[0.6rem] leading-relaxed text-muted">
                Matching claim names also get their current VA % updated for Increase filing. VCH does not send your VA password or home address. If VA provides an SSN, only the last four digits are sent.
              </p>
            </div>
          </div>

          <p
            v-else-if="hasRatingsData && !hasProfilePreviewData"
            class="rounded-md border border-dashed border-warning/40 bg-warning/5 px-2.5 py-2 text-[0.65rem] leading-relaxed text-muted"
          >
            Name, DOB, phone, and service history need a live VA.gov sign-in. Open VA.gov in this browser, then tap refresh above.
          </p>

          <label class="flex items-start gap-2.5 rounded-md border border-default/70 bg-default/40 p-2.5">
            <input
              v-model="importConsent"
              type="checkbox"
              class="mt-0.5 size-4 rounded border-default accent-primary"
            >
            <span class="text-[0.65rem] leading-relaxed text-muted">
              I approve sending the data listed above to my ClaimBuilder account.
            </span>
          </label>

          <div
            v-if="importSuccess || importError || !hubCanImport"
            class="space-y-2"
          >
            <p
              v-if="importSuccess"
              class="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs leading-relaxed text-primary"
            >
              {{ importSuccess }}
            </p>
            <p
              v-if="importError"
              class="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs leading-relaxed text-red-500"
            >
              {{ importError }}
            </p>
            <p
              v-if="!hubCanImport && !importError"
              class="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs leading-relaxed text-warning"
            >
              Sign in at veteranscentralhub.com in this browser to populate ClaimBuilder settings.
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <UButton
              block
              size="sm"
              color="primary"
              leading-icon="i-lucide-cloud-upload"
              :disabled="!importConsent || !hubCanImport"
              :loading="importBusy"
              label="Populate ClaimBuilder settings"
              @click="populateClaimBuilderSettings"
            />
            <UButton
              v-if="!hubCanImport"
              block
              size="sm"
              color="neutral"
              variant="outline"
              label="Sign in to Hub"
              @click="openHubSignIn"
            />
            <UButton
              block
              size="sm"
              color="neutral"
              variant="ghost"
              label="Open ClaimBuilder"
              @click="openClaimBuilder(false)"
            />
          </div>
        </div>

        <div v-if="rows.length === 0 && combinedRating == null && isStale" class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center">
          <p class="text-muted text-sm">
            Saved ratings on this device did not include individual conditions. Sign in at VA.gov to refresh.
          </p>
          <UButton block size="sm" color="primary" label="Sign in to VA.gov" @click="openVaSignIn" />
        </div>

        <ul v-else-if="rows.length" class="space-y-2">
          <li
            v-for="row in rows"
            :key="row.id"
            class="rounded-lg border border-default bg-elevated/40 p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 font-medium text-sm text-highlighted">
                {{ row.name }}
              </p>
              <span class="shrink-0 font-semibold text-primary">
                {{ row.rating != null ? `${row.rating}%` : '—' }}
              </span>
            </div>
            <p class="mt-1 text-muted text-xs">
              <span v-if="row.decision">{{ row.decision }}</span>
              <span v-if="row.effectiveDate"> · Effective {{ formatVaDate(row.effectiveDate) }}</span>
              <span v-if="row.static === true"> · Static</span>
              <span v-if="row.diagnosticCode"> · DC {{ row.diagnosticCode }}</span>
            </p>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
