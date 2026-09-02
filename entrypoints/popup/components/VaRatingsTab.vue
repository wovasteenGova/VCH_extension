<script setup lang="ts">
import {
  buildClaimBuilderVaImportPayload,
  importVaRatingsToClaimBuilder
} from '@/shared/claimBuilderVaImport'
import { openHubSignIn, probeHubSession, type ConnectionState } from '@/shared/connectionStatus'
import { VA_DISABILITY_RATING_PAGE, VA_SIGN_IN_PAGE } from '@/shared/vaEndpoints'
import { fetchVaRatedDisabilities, fetchVaUser, formatVaDate } from '@/shared/vaClient'
import { parseVaRatingsResponse, sortRatingsByPercent, type ParsedVaRating } from '@/shared/vaRatingParse'
import { parseVaUserProfileForClaimBuilder } from '@/shared/vaUserProfileParse'
import { readVaDeviceCache, saveVaRatingsCache } from '@/shared/vaDeviceCache'
import { CLAIMBUILDER_URL } from '@/shared/urls'
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
const hubSession = ref<ConnectionState>({ connected: false, label: 'Checking…' })

const hasRatingsData = computed(() => combinedRating.value != null || rows.value.length > 0)

async function refreshHubSession() {
  hubSession.value = await probeHubSession()
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
    if (restored) {
      isStale.value = true
      error.value = null
      return
    }
    isStale.value = false
    error.value = response.error
    clearRatingsDisplay()
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
  const cache = await readVaDeviceCache()
  lastSyncedAt.value = cache.lastSyncedAt
}

function openVaSignIn() {
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

function openVaDisabilityRating() {
  void browser.tabs.create({ url: VA_DISABILITY_RATING_PAGE })
}

function openClaimBuilder() {
  void browser.tabs.create({ url: CLAIMBUILDER_URL })
}

async function populateClaimBuilderSettings() {
  if (!importConsent.value || importBusy.value) return
  if (!rows.value.length && combinedRating.value == null) return

  importBusy.value = true
  importError.value = null
  importSuccess.value = null

  try {
    const userResponse = await fetchVaUser()
    const profile = userResponse.ok
      ? parseVaUserProfileForClaimBuilder(userResponse.data)
      : null

    const result = await importVaRatingsToClaimBuilder(
      buildClaimBuilderVaImportPayload({
        combinedRating: combinedRating.value,
        combinedEffectiveDate: combinedEffectiveDate.value,
        rows: rows.value,
        profile
      })
    )

    const applied = result.appliedToConditionIds.length
    const profileNote = result.appliedProfileFields.length
      ? ` Updated Project settings: ${result.appliedProfileFields.map(field => field.replace(/_/g, ' ')).join(', ')}.`
      : ''
    importSuccess.value = applied
      ? `Saved to ClaimBuilder and matched ${applied} existing claim${applied === 1 ? '' : 's'} with current ratings.${profileNote}`
      : `Saved combined rating and conditions to ClaimBuilder.${profileNote} Open a claim to use them for increase filing.`
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
    await hydrateRatingsFromDevice()
    void loadRatings()
  } else {
    clearRatingsDisplay()
  }
})

onMounted(async () => {
  await Promise.all([init(), refreshHubSession()])
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
          @click="loadRatings"
        />
      </div>
    </div>

    <div
      v-if="!supported"
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
              ? 'Unlock with Windows Hello or your device passkey to view combined and individual disability ratings.'
              : 'Set up a one-time device passkey. Ratings stay hidden until you unlock them each time you open this tab.' }}
          </p>
        </div>
      </div>

      <UButton
        block
        size="sm"
        color="primary"
        leading-icon="i-lucide-fingerprint"
        :loading="lockBusy"
        :label="hasCredential ? 'Unlock with passkey' : 'Set up passkey & unlock'"
        @click="hasCredential ? unlock() : setupLock()"
      />

      <p v-if="lockError" class="text-center text-xs font-medium text-red-500">
        {{ lockError }}
      </p>

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
          v-if="combinedRating != null || rows.length"
          class="space-y-3 rounded-lg border border-default bg-elevated/30 p-3"
        >
          <div class="space-y-1">
            <p class="font-medium text-sm text-highlighted">
              Populate VCH settings with claim data
            </p>
            <p class="text-muted text-[0.65rem] leading-relaxed">
              With your approval, VCH saves your combined rating, service-connected conditions, date of birth, and phone (when VA provides them) to your signed-in account. Your data is stored on a secure third-party cloud service and used only to pre-fill ClaimBuilder Project settings and current ratings for increase claims — including mental health when VA lists PTSD, anxiety, or similar conditions.
            </p>
          </div>

          <label class="flex items-start gap-2.5 rounded-md border border-default/70 bg-default/40 p-2.5">
            <input
              v-model="importConsent"
              type="checkbox"
              class="mt-0.5 size-4 rounded border-default accent-primary"
            >
            <span class="text-[0.65rem] leading-relaxed text-muted">
              I approve VCH saving my VA disability ratings, date of birth, and phone to my account. VCH does not store my VA password.
            </span>
          </label>

          <div class="flex flex-col gap-2">
            <UButton
              block
              size="sm"
              color="primary"
              leading-icon="i-lucide-cloud-upload"
              :disabled="!importConsent"
              :loading="importBusy"
              label="Populate ClaimBuilder settings"
              @click="populateClaimBuilderSettings"
            />
            <UButton
              v-if="!hubSession.connected"
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
              @click="openClaimBuilder"
            />
          </div>

          <p v-if="importSuccess" class="text-center text-xs font-medium text-primary">
            {{ importSuccess }}
          </p>
          <p v-if="importError" class="text-center text-xs font-medium text-red-500">
            {{ importError }}
          </p>
        </div>

        <div v-if="rows.length === 0 && !isStale" class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center">
          <p class="text-muted text-sm">
            No rated disabilities returned. If you have a VA rating, open your disability rating page on VA.gov first, then refresh.
          </p>
          <UButton block size="sm" color="primary" label="Open VA disability rating" @click="openVaDisabilityRating" />
        </div>

        <ul v-else class="space-y-2">
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
