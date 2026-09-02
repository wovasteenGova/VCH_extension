<script setup lang="ts">
import { VA_SIGN_IN_PAGE } from '@/shared/vaEndpoints'
import { fetchVaRatedDisabilities, formatVaDate, unwrapVaData } from '@/shared/vaClient'

type DisabilityRow = {
  name: string
  rating: string
  effectiveDate?: string
}

const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<DisabilityRow[]>([])
const combinedRating = ref<string | null>(null)

function normalizeDisability(raw: unknown): DisabilityRow | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const attrs = (item.attributes && typeof item.attributes === 'object')
    ? item.attributes as Record<string, unknown>
    : item

  const name = String(attrs.name || attrs.diagnosticText || attrs.condition || 'Condition')
  const ratingValue = attrs.ratingPercentage ?? attrs.disabilityRating ?? attrs.rating
  const rating = ratingValue != null ? `${ratingValue}%` : '—'

  return {
    name,
    rating,
    effectiveDate: typeof attrs.effectiveDate === 'string' ? attrs.effectiveDate : undefined
  }
}

async function loadRatings() {
  loading.value = true
  error.value = null

  const response = await fetchVaRatedDisabilities()
  loading.value = false

  if (!response.ok) {
    error.value = response.error
    rows.value = []
    combinedRating.value = null
    return
  }

  const payload = response.data as Record<string, unknown> | null
  const list = unwrapVaData<unknown[]>(response.data) || []
  rows.value = list.map(normalizeDisability).filter(Boolean) as DisabilityRow[]

  const meta = payload?.meta
  if (meta && typeof meta === 'object') {
    const combined = (meta as Record<string, unknown>).combinedDisabilityRating
      ?? (meta as Record<string, unknown>).combinedRating
    combinedRating.value = combined != null ? `${combined}%` : null
  }
}

function openVaSignIn() {
  void browser.tabs.create({ url: VA_SIGN_IN_PAGE })
}

onMounted(() => {
  void loadRatings()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <p class="font-medium text-sm text-highlighted">
        Rated disabilities
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        aria-label="Refresh ratings"
        @click="loadRatings"
      />
    </div>

    <UAlert
      v-if="error"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="error"
      description="Uses the same VA.gov session as Claim Tracker. Sign in at VA.gov, then refresh."
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" label="Sign in to VA.gov" @click="openVaSignIn" />
      </template>
    </UAlert>

    <div v-else-if="loading" class="flex flex-1 items-center justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <div v-else class="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
      <div
        v-if="combinedRating"
        class="rounded-lg border border-primary/30 bg-primary/10 p-3 text-center"
      >
        <p class="text-muted text-xs">
          Combined rating
        </p>
        <p class="font-semibold text-2xl text-highlighted">
          {{ combinedRating }}
        </p>
      </div>

      <p v-if="rows.length === 0" class="text-center text-muted text-sm">
        No rated disabilities returned for this session.
      </p>

      <ul v-else class="space-y-2">
        <li
          v-for="(row, index) in rows"
          :key="`${row.name}-${index}`"
          class="rounded-lg border border-default bg-elevated/40 p-3"
        >
          <p class="font-medium text-sm text-highlighted">
            {{ row.name }}
          </p>
          <p class="text-muted text-xs">
            Rating: {{ row.rating }}
            <span v-if="row.effectiveDate"> · Effective {{ formatVaDate(row.effectiveDate) }}</span>
          </p>
        </li>
      </ul>
    </div>
  </div>
</template>
