<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CLAIMBUILDER_URL, VCH_HUB_URL } from '@/shared/urls'
import { sendExtensionMessage } from '@/utils/messaging'

type TabContext = {
  onVaGov: boolean
  pageUrl: string
  pageTitle: string
  selection: string
}

const loading = ref(true)
const error = ref('')
const tabContext = ref<TabContext | null>(null)
const lastClip = ref<{ text: string, pageTitle: string, savedAt: string } | null>(null)

const onVaGov = computed(() => tabContext.value?.onVaGov ?? false)
const hasSelection = computed(() => Boolean(tabContext.value?.selection?.trim()))

async function refreshContext() {
  loading.value = true
  error.value = ''
  try {
    const response = await sendExtensionMessage({
      type: 'GET_ACTIVE_TAB_CONTEXT'
    })
    if (!response.ok) {
      error.value = response.error
      tabContext.value = null
      return
    }
    tabContext.value = {
      onVaGov: response.onVaGov,
      pageUrl: response.pageUrl,
      pageTitle: response.pageTitle,
      selection: response.selection
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not read the active tab'
    tabContext.value = null
  } finally {
    loading.value = false
  }
}

async function loadLastClip() {
  const stored = await browser.storage.local.get('lastClip')
  const clip = stored.lastClip
  if (clip && typeof clip === 'object' && 'text' in clip) {
    lastClip.value = clip as { text: string, pageTitle: string, savedAt: string }
  }
}

async function saveSelection() {
  if (!tabContext.value?.selection?.trim()) return
  await sendExtensionMessage({
    type: 'CLIP_SELECTION',
    text: tabContext.value.selection,
    pageUrl: tabContext.value.pageUrl,
    pageTitle: tabContext.value.pageTitle
  })
  await loadLastClip()
}

function openUrl(url: string) {
  void browser.tabs.create({ url })
}

onMounted(async () => {
  await Promise.all([refreshContext(), loadLastClip()])
})
</script>

<template>
  <UApp>
    <div class="flex min-h-[28rem] w-[22rem] flex-col gap-4 p-4">
      <header class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <img
            src="/vch-logo.png"
            alt="Veterans Central Hub"
            class="size-10 rounded-lg object-contain"
          >
          <div>
            <p class="font-semibold text-highlighted">
              VCH Connector
            </p>
            <p class="text-muted text-xs">
              VA.gov ↔ Hub ↔ ClaimBuilder
            </p>
          </div>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          :loading="loading"
          aria-label="Refresh page context"
          @click="refreshContext"
        />
      </header>

      <UAlert
        v-if="error"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Limited context on this tab"
        :description="error"
      />

      <UCard v-else :ui="{ body: 'space-y-3 p-4' }">
        <div class="flex items-center justify-between gap-2">
          <p class="font-medium text-sm">
            Active page
          </p>
          <UBadge
            :color="onVaGov ? 'primary' : 'neutral'"
            variant="subtle"
          >
            {{ onVaGov ? 'VA.gov' : 'Other site' }}
          </UBadge>
        </div>
        <p class="line-clamp-2 text-muted text-xs">
          {{ tabContext?.pageTitle || 'No page title' }}
        </p>
      </UCard>

      <div class="grid gap-2">
        <UButton
          block
          color="primary"
          icon="i-lucide-house"
          label="Open VCH Hub"
          @click="openUrl(VCH_HUB_URL)"
        />
        <UButton
          block
          color="neutral"
          variant="soft"
          icon="i-lucide-file-badge"
          label="Open ClaimBuilder"
          @click="openUrl(CLAIMBUILDER_URL)"
        />
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-clipboard-copy"
          :disabled="!hasSelection"
          label="Save selected text locally"
          @click="saveSelection"
        />
      </div>

      <UCard
        v-if="lastClip"
        :ui="{ body: 'space-y-2 p-4' }"
      >
        <p class="font-medium text-sm">
          Last saved clip
        </p>
        <p class="text-muted text-xs">
          {{ lastClip.pageTitle }}
        </p>
        <p class="line-clamp-4 text-xs">
          {{ lastClip.text }}
        </p>
      </UCard>

      <p class="mt-auto text-muted text-xs leading-relaxed">
        MVP scaffold: clips stay on this device until VCH account linking is wired up.
      </p>
    </div>
  </UApp>
</template>
