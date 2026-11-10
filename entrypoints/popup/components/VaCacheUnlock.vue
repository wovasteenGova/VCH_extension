<script setup lang="ts">
import { hasLocalDataConsent } from '@/shared/privacyConsent'
import { unlockVaVault } from '@/shared/vaLocalVault'

const props = defineProps<{ setup: boolean }>()
const emit = defineEmits<{ unlocked: [], privacy: [] }>()
const passphrase = ref('')
const confirmation = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  if (busy.value) return
  error.value = ''
  if (props.setup && passphrase.value !== confirmation.value) {
    error.value = 'The passphrases do not match.'
    return
  }
  busy.value = true
  try {
    await unlockVaVault(passphrase.value, hasLocalDataConsent)
    passphrase.value = ''
    confirmation.value = ''
    emit('unlocked')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not unlock saved VA data. Try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-3 py-3 text-sm" aria-labelledby="va-cache-heading">
    <h2 id="va-cache-heading" class="text-base font-semibold text-highlighted">
      {{ setup ? 'Protect your saved VA data' : 'Unlock saved VA data' }}
    </h2>
    <p class="text-muted">
      {{ setup
        ? 'Create a passphrase of at least 12 characters to encrypt VA data saved in this browser. Keep it somewhere safe. If you forget it, you’ll need to clear your local copy and sync again.'
        : 'Enter your passphrase to see your saved records or sync VA data.' }}
    </p>
    <p class="text-muted">Your cache locks when you restart the browser, reload the extension, or lock it in Data controls.</p>
    <form class="space-y-3" @submit.prevent="submit">
      <UFormField label="Cache passphrase">
        <UInput
          v-model="passphrase"
          type="password"
          class="w-full"
          :autocomplete="setup ? 'new-password' : 'current-password'"
          :minlength="setup ? 12 : undefined"
          maxlength="1024"
          required
        />
      </UFormField>
      <UFormField v-if="setup" label="Confirm passphrase">
        <UInput v-model="confirmation" type="password" class="w-full" autocomplete="new-password" maxlength="1024" required />
      </UFormField>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton type="submit" :loading="busy">{{ setup ? 'Encrypt saved VA data' : 'Unlock' }}</UButton>
        <UButton type="button" color="neutral" variant="outline" :disabled="busy" @click="emit('privacy')">Data controls</UButton>
      </div>
    </form>
  </section>
</template>
