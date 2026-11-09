<script setup lang="ts">
import { buildClaimBuilderVaImportPayload } from '@/shared/claimBuilderVaImport'
import type { ConnectionState } from '@/shared/connectionStatus'
import { VA_DISABILITY_RATING_PAGE } from '@/shared/vaEndpoints'
import { openVaSignIn } from '@/shared/vaSignInNavigation'
import { fetchVaRatedDisabilities, formatVaDate } from '@/shared/vaClient'
import { parseVaRatingsResponse, sortRatingsByPercent, type ParsedVaRating } from '@/shared/vaRatingParse'
import type { ParsedVaUserProfileForImport } from '@/shared/vaUserProfileParse'
import { hydrateVaProfileFromDevice, refreshVaProfileForImport } from '@/shared/vaUserProfileFetch'
import { buildVaImportPreviewItems } from '@/shared/vaImportPreview'
import { persistLiveVaCaches } from '@/shared/vaCacheSync'
import { readVaDeviceCache, saveVaRatingsCache } from '@/shared/vaDeviceCache'
import {
  assessRatingsAvailability,
  refreshRatingsGateState,
  type RatingsAvailability
} from '@/shared/ratingsAvailability'
import { useRatingsPasskeyLock } from '../composables/useRatingsPasskeyLock'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

// VA's 2026 base rates (effective December 1, 2025) for a veteran without dependents.
// https://www.va.gov/disability/compensation-rates/veteran-rates/
const baseMonthlyRate2026: Readonly<Record<number, number | undefined>> = {
  0: 0,
  10: 180.42,
  20: 356.66,
  30: 552.47,
  40: 795.84,
  50: 1132.90,
  60: 1435.02,
  70: 1808.45,
  80: 2102.15,
  90: 2362.30,
  100: 3938.58
}
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

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

const toast = useToast()
const loading = ref(false)
/** True while fetching from VA.gov in the background (refresh button); main list shows cache first. */
const ratingsSyncing = ref(false)
const error = ref<string | null>(null)
const isStale = ref(false)
const lastSyncedAt = ref<string | null>(null)
const rows = ref<ParsedVaRating[]>([])
const combinedRating = ref<number | null>(null)
const combinedEffectiveDate = ref<string | undefined>()
const vaSession = ref<ConnectionState>({ connected: false, label: 'Checking…' })
const importProfilePreview = ref<ParsedVaUserProfileForImport | null>(null)
const gateChecking = ref(true)
const profileRefreshing = ref(false)
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
    return 'Passkey verified, but VA.gov is not signed in on this browser and nothing is saved on this device yet.'
  }
  if (error.value) return error.value
  return 'No disability ratings loaded. Open your disability rating on VA.gov, then refresh here.'
})

const hasRatingsData = computed(() => combinedRating.value != null || rows.value.length > 0)
const monthlyEstimate = computed(() => {
  const rate = combinedRating.value == null ? undefined : baseMonthlyRate2026[combinedRating.value]
  return rate === undefined ? null : usd.format(rate)
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

async function refreshImportProfilePreview() {
  profileRefreshing.value = true
  try {
    const previous = importProfilePreview.value
    const next = await refreshVaProfileForImport()
    importProfilePreview.value = next ?? previous ?? await hydrateVaProfileFromDevice()
  } finally { profileRefreshing.value = false }
}

async function refreshRatingsAndProfile() {
  try {
    const [refreshed] = await Promise.all([loadRatings(), refreshImportProfilePreview()])
    toast.add(!refreshed
      ? { title: 'Could not refresh VA ratings', description: error.value ?? 'Showing previously saved ratings.', color: 'warning' }
      : { title: 'VA ratings refreshed', color: 'success' })
  } catch (caught) {
    toast.add({ title: 'Could not refresh VA ratings', description: caught instanceof Error ? caught.message : 'Try again.', color: 'error' })
  }
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
  if (!unlocked.value) return false

  error.value = null
  ratingsSyncing.value = true
  loading.value = !hasRatingsData.value

  const hadDataBeforeFetch = hasRatingsData.value
  if (!hadDataBeforeFetch) {
    const hydrated = await hydrateRatingsFromDevice()
    if (hydrated) {
      hasCachedRatings.value = true
      isStale.value = !vaSession.value.connected
      error.value = null
    }
  }

  try {
    const response = await fetchVaRatedDisabilities()

    if (!response.ok) {
      const restored = await hydrateRatingsFromDevice()
      hasCachedRatings.value = restored
      if (restored || hasRatingsData.value) {
        isStale.value = !vaSession.value.connected
        error.value = null
        return false
      }
      isStale.value = false
      clearRatingsDisplay()
      error.value = response.error
      void refreshRatingsGate()
      return false
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
    return true
  } finally {
    ratingsSyncing.value = false
    loading.value = false
  }
}

function openVaDisabilityRating() {
  void browser.tabs.create({ url: VA_DISABILITY_RATING_PAGE })
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
    void refreshImportProfilePreview()
    void loadRatings()
  } else {
    clearRatingsDisplay()
    importProfilePreview.value = null
  }
})

onMounted(async () => {
  const onStorage = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes['vch-va-device-cache-v1'] && !changes['vch-va-device-cache-v1']!.newValue) {
      lockRatings()
      clearRatingsDisplay()
      importProfilePreview.value = null
    }
  }
  browser.storage.onChanged.addListener(onStorage)
  onUnmounted(() => browser.storage.onChanged.removeListener(onStorage))
  await Promise.all([init(), refreshRatingsGate()])
})

onUnmounted(() => {
  lockRatings()
})
const ready = computed(() => unlocked.value && hasRatingsData.value && !loading.value && !ratingsSyncing.value && !profileRefreshing.value)
defineExpose({ ready, previewItems: importPreviewItems, payload: currentImportPayload })
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
          :loading="ratingsSyncing"
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
          size="md"
          color="primary"
          label="Sign in to VA.gov"
          @click="openVaSignIn"
        />
        <UButton
          v-if="!ratingsGate.available && ratingsGate.reason === 'no_ratings'"
          block
          size="md"
          color="primary"
          label="Open disability rating"
          @click="openVaDisabilityRating"
        />
        <UButton
          block
          size="md"
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
              ? 'Open with Windows Hello, a device passkey, or your browser saved passkey.'
              : 'Set up a passkey to hide ratings until you open them. Windows Hello, this device, or your browser saved passkey all work in Chrome and Edge.' }}
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
        size="md"
        color="primary"
        leading-icon="i-lucide-fingerprint"
        :loading="lockBusy"
        :label="hasCredential ? 'Open with passkey' : 'Set up passkey'"
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
          <UButton size="sm" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
          <UButton size="sm" color="primary" variant="soft" label="Open disability rating" @click="openVaDisabilityRating" />
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
          size="md"
          color="primary"
          label="Sign in to VA.gov"
          @click="openVaSignIn"
        />
        <UButton
          block
          size="md"
          :color="vaSession.connected ? 'primary' : 'neutral'"
          :variant="vaSession.connected ? 'solid' : 'outline'"
          label="Open disability rating"
          @click="openVaDisabilityRating"
        />
        <UButton
          block
          size="md"
          color="neutral"
          variant="ghost"
          label="Refresh ratings"
          :loading="loading"
          @click="refreshRatingsAndProfile"
        />
        <UButton
          block
          size="md"
          color="neutral"
          variant="soft"
          label="Lock ratings again"
          @click="lockRatings"
        />
      </div>

      <div v-else-if="hasRatingsData || isStale" class="space-y-3">
        <div
          v-if="combinedRating != null"
          class="overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-default"
        >
          <div class="grid p-3" :class="monthlyEstimate ? 'grid-cols-2' : 'grid-cols-1'">
            <div class="min-w-0 pr-2">
              <p class="text-xs font-medium text-muted">Combined rating</p>
              <p class="mt-1 text-2xl font-semibold leading-tight tabular-nums text-highlighted">{{ combinedRating }}%</p>
              <p v-if="combinedEffectiveDate" class="mt-1 text-xs text-muted">
                Effective {{ formatVaDate(combinedEffectiveDate) }}
              </p>
            </div>
            <div v-if="monthlyEstimate" class="min-w-0 border-s border-default ps-3">
              <p class="text-xs font-medium text-muted">Monthly estimate</p>
              <p class="mt-1 text-2xl font-semibold leading-tight tabular-nums text-highlighted">{{ monthlyEstimate }}</p>
              <p class="mt-1 text-xs text-muted">2026 base rate · no dependents</p>
            </div>
          </div>
          <a
            href="https://www.va.gov/va-payment-history/"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-between gap-2 border-t border-default px-3 py-2 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            View VA payment history
            <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0" />
          </a>
        </div>

        <div v-if="rows.length === 0 && combinedRating == null && isStale" class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center">
          <p class="text-muted text-sm">
            Saved ratings on this device did not include individual conditions. Sign in at VA.gov to refresh.
          </p>
          <UButton block size="md" color="primary" label="Sign in to VA.gov" @click="openVaSignIn" />
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
                {{ row.rating != null ? `${row.rating}%` : 'N/A' }}
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
