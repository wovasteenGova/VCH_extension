<script setup lang="ts">
import { buildClaimBuilderVaImportPayload } from '@/shared/claimBuilderVaImport'
import { VA_DISABILITY_RATING_PAGE } from '@/shared/vaEndpoints'
import { openVaSignIn } from '@/shared/vaSignInNavigation'
import { fetchVaRatedDisabilities, formatVaDate } from '@/shared/vaClient'
import { parseVaRatingsResponse, sortRatingsByPercent, type ParsedVaRating } from '@/shared/vaRatingParse'
import type { ParsedVaUserProfileForImport } from '@/shared/vaUserProfileParse'
import { refreshVaProfileForImport } from '@/shared/vaUserProfileFetch'
import { buildVaImportPreviewItems } from '@/shared/vaImportPreview'
import { checkVaCacheEpoch, isRecentVaDeviceSync, readVaDeviceCache, saveVaRatingsCache, VA_CACHE_OWNER_KEY, VA_DEVICE_CACHE_STORAGE_KEY, type VaDeviceCache } from '@/shared/vaDeviceCache'
import { assessRatingsAvailability, type RatingsAvailability } from '@/shared/ratingsAvailability'
import { RATINGS_LOCK_CREDENTIAL_KEY } from '@/shared/ratingsPasskeyLock'
import { useRatingsPasskeyLock } from '../composables/useRatingsPasskeyLock'
import VaStaleSyncBanner from './VaStaleSyncBanner.vue'

const props = defineProps<{ active: boolean }>()
const PASSKEY_SETUP_DISMISSED_KEY = 'vch-va-ratings-passkey-setup-dismissed'

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
  syncCredential,
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
const vaConnected = ref(false)
const importProfilePreview = ref<ParsedVaUserProfileForImport | null>(null)
const gateChecking = ref(true)
const profileRefreshing = ref(false)
const manualRefresh = ref(false)
const lockInitialized = ref(false)
const setupDismissed = ref(false)
const setupRequested = ref(false)
const ratingsGate = ref<RatingsAvailability>({
  available: false,
  reason: 'va_sign_in',
  message: 'Sign in to VA.gov before protecting or viewing disability ratings.'
})

const canUsePasskeyGate = computed(() => ratingsGate.value.available)
const ratingsVisible = computed(() => lockInitialized.value && (
  hasCredential.value ? unlocked.value : setupDismissed.value && !setupRequested.value
))

const gateMessage = computed(() => {
  if (ratingsGate.value.available) return ''
  return ratingsGate.value.message
})

const emptyUnlockedMessage = computed(() => {
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

let displayGeneration = 0

async function refreshImportProfilePreview() {
  if (profileRefreshing.value) return
  const generation = displayGeneration
  profileRefreshing.value = true
  try {
    const profile = await refreshVaProfileForImport()
    if (ratingsVisible.value && generation === displayGeneration) importProfilePreview.value = profile
  } catch {
    // The saved profile remains available when a background refresh fails.
  } finally {
    if (generation === displayGeneration) profileRefreshing.value = false
  }
}

async function refreshRatingsAndProfile() {
  if (ratingsSyncing.value) return
  manualRefresh.value = true
  void refreshImportProfilePreview()
  try {
    const refreshed = await loadRatings()
    toast.add(refreshed
      ? { title: 'VA ratings refreshed', color: 'success' }
      : { title: 'Could not refresh VA ratings', description: error.value ?? 'Showing previously saved ratings.', color: 'warning' })
  } finally {
    manualRefresh.value = false
  }
}

async function refreshRatingsGate() {
  gateChecking.value = true
  try {
    ratingsGate.value = await assessRatingsAvailability()
    vaConnected.value = ratingsGate.value.available && ratingsGate.value.source === 'live'
  } catch {
    ratingsGate.value = { available: false, reason: 'fetch_failed', message: 'Could not check your VA ratings right now.' }
  } finally {
    gateChecking.value = false
  }
}

function applyRatings(ratings: VaDeviceCache['ratings'], syncedAt: string | null) {
  combinedRating.value = ratings?.combinedRating ?? null
  combinedEffectiveDate.value = ratings?.combinedEffectiveDate
  rows.value = sortRatingsByPercent(ratings?.rows ?? [])
  lastSyncedAt.value = ratings?.fetchedAt ?? syncedAt
}

async function loadRatings() {
  if (!ratingsVisible.value || ratingsSyncing.value) return false
  const generation = displayGeneration
  error.value = null
  ratingsSyncing.value = true
  loading.value = !hasRatingsData.value

  try {
    const response = await fetchVaRatedDisabilities()
    if (!ratingsVisible.value || generation !== displayGeneration) return false
    if (!response.ok) {
      vaConnected.value = false
      isStale.value = hasRatingsData.value
      if (!hasRatingsData.value) error.value = response.error
      return false
    }

    const summary = parseVaRatingsResponse(response.data)
    if (response.ownerEpoch && !await checkVaCacheEpoch(response.ownerEpoch)) return false
    if (!ratingsVisible.value || generation !== displayGeneration) return false
    vaConnected.value = true
    isStale.value = false
    const ratings = {
      combinedRating: summary.combinedRating,
      combinedEffectiveDate: summary.combinedEffectiveDate,
      rows: summary.ratings,
      fetchedAt: new Date().toISOString()
    }
    applyRatings(ratings, null)
    if (response.ownerEpoch) await saveVaRatingsCache(ratings, response.ownerEpoch)
    return true
  } catch {
    if (generation === displayGeneration) {
      isStale.value = hasRatingsData.value
      if (!hasRatingsData.value) error.value = 'Could not read VA ratings.'
    }
    return false
  } finally {
    if (generation === displayGeneration) {
      ratingsSyncing.value = false
      loading.value = false
    }
  }
}

function openVaDisabilityRating() {
  void browser.tabs.create({ url: VA_DISABILITY_RATING_PAGE })
}

function clearRatingsDisplay() {
  displayGeneration++
  error.value = null
  isStale.value = false
  loading.value = false
  ratingsSyncing.value = false
  profileRefreshing.value = false
  applyRatings(null, null)
  importProfilePreview.value = null
}

function lockRatings() {
  lock()
  clearRatingsDisplay()
}

function openProtection() {
  if (hasCredential.value) lock()
  else setupRequested.value = true
}

async function dismissProtection() {
  try {
    await browser.storage.local.set({ [PASSKEY_SETUP_DISMISSED_KEY]: true })
    setupDismissed.value = true
    setupRequested.value = false
  } catch {
    toast.add({ title: 'Could not save your ratings preference', color: 'error' })
  }
}

async function removeProtection() {
  await removeLock()
  if (!hasCredential.value) await dismissProtection()
}

watch(ratingsVisible, (visible) => {
  if (!visible) clearRatingsDisplay()
}, { flush: 'sync' })

watch([ratingsVisible, canUsePasskeyGate, () => props.active], async ([visible, available, active]) => {
  if (!visible || !available || !active) return
  const generation = displayGeneration
  const cache = await readVaDeviceCache()
  if (!ratingsVisible.value || generation !== displayGeneration) return
  if (cache.ratings && !hasRatingsData.value) applyRatings(cache.ratings, cache.lastSyncedAt)
  importProfilePreview.value ??= cache.profile
  const fresh = isRecentVaDeviceSync(cache.ratings?.fetchedAt)
  if (!fresh || !importProfilePreview.value) void refreshImportProfilePreview()
  if (!fresh || !hasRatingsData.value) void loadRatings()
})

onMounted(async () => {
  const onStorage = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const credential = changes[RATINGS_LOCK_CREDENTIAL_KEY]
    if (credential) syncCredential(credential.newValue)
    const change = changes[VA_DEVICE_CACHE_STORAGE_KEY]
    if (changes[VA_CACHE_OWNER_KEY] || (change && !change.newValue)) {
      lockRatings()
      if (!gateChecking.value) void refreshRatingsGate()
      return
    }
    const cache = change?.newValue as VaDeviceCache | undefined
    const previous = change?.oldValue as VaDeviceCache | undefined
    if (cache?.ratings && cache.ratings.fetchedAt !== previous?.ratings?.fetchedAt) {
      ratingsGate.value = { available: true, source: 'cache' }
      if (ratingsVisible.value) {
        applyRatings(cache.ratings, cache.lastSyncedAt)
        isStale.value = false
      }
    }
  }
  browser.storage.onChanged.addListener(onStorage)
  onUnmounted(() => browser.storage.onChanged.removeListener(onStorage))
  const [settings] = await Promise.all([
    browser.storage.local.get(PASSKEY_SETUP_DISMISSED_KEY).catch(() => ({} as Record<string, unknown>)),
    init(),
    refreshRatingsGate()
  ])
  setupDismissed.value = settings[PASSKEY_SETUP_DISMISSED_KEY] === true
  lockInitialized.value = true
})

onUnmounted(lockRatings)
const ready = computed(() => ratingsVisible.value && hasRatingsData.value)
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
          v-if="ratingsVisible && canUsePasskeyGate"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-lock"
          :aria-label="hasCredential ? 'Lock ratings' : 'Protect your ratings'"
          :title="hasCredential ? 'Lock ratings' : 'Protect your ratings'"
          @click="openProtection"
        />
        <UButton
          v-if="ratingsVisible && canUsePasskeyGate"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="manualRefresh"
          :disabled="ratingsSyncing"
          aria-label="Refresh ratings"
          @click="refreshRatingsAndProfile"
        />
      </div>
    </div>

    <div
      v-if="gateChecking || !lockInitialized"
      class="flex items-center justify-center py-10"
    >
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
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
      v-else-if="!ratingsVisible"
      class="space-y-3 rounded-lg border border-default bg-elevated/30 p-4"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-primary" />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <p class="font-medium text-sm text-highlighted">
              {{ hasCredential ? 'Ratings are protected' : 'Protect your ratings' }}
            </p>
            <UButton
              v-if="!hasCredential"
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Dismiss passkey setup"
              title="Continue without a passkey"
              :disabled="lockBusy"
              @click="dismissProtection"
            />
          </div>
          <p class="text-muted text-xs leading-relaxed">
            {{ !supported
              ? 'Passkey protection is unavailable in this browser.'
              : hasCredential
                ? 'Open with Windows Hello, a device passkey, or your browser saved passkey.'
                : 'Set up a passkey to protect your ratings on this device.' }}
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
        v-if="supported"
        block
        size="md"
        color="primary"
        leading-icon="i-lucide-fingerprint"
        :loading="lockBusy"
        :label="hasCredential ? 'Open with passkey' : 'Set up passkey'"
        @click="hasCredential ? unlock() : setupLock()"
      />

      <button
        v-if="hasCredential && supported"
        type="button"
        class="w-full text-center text-muted text-[0.65rem] underline-offset-2 hover:underline"
        :disabled="lockBusy"
        @click="removeProtection"
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
          v-if="!vaConnected"
          block
          size="md"
          color="primary"
          label="Sign in to VA.gov"
          @click="openVaSignIn"
        />
        <UButton
          block
          size="md"
          :color="vaConnected ? 'primary' : 'neutral'"
          :variant="vaConnected ? 'solid' : 'outline'"
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
            <p v-if="row.decision || row.effectiveDate || row.diagnosticCode" class="mt-1 text-muted text-xs">
              <span v-if="row.decision">{{ row.decision }}</span>
              <span v-if="row.effectiveDate"> · Effective {{ formatVaDate(row.effectiveDate) }}</span>
              <span v-if="row.diagnosticCode"> · DC {{ row.diagnosticCode }}</span>
            </p>
            <UBadge
              class="mt-2"
              :color="row.static === true ? 'success' : 'neutral'"
              size="md"
              variant="soft"
            >
              {{ row.static === true ? 'Static' : row.static === false ? 'Non-static' : 'Static status unavailable' }}
            </UBadge>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
