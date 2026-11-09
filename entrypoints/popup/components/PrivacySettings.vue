<script setup lang="ts">
import { acceptLocalDataAccess, clearVaDataAndConsent, revokeCloudConsent } from '@/shared/privacyConsent'

defineProps<{ accepted: boolean }>()
const emit = defineEmits<{ accepted: [], cleared: [], close: [] }>()
const localApproval = ref(false)
const busy = ref(false)
const error = ref('')
const status = ref('')
const toast = useToast()

async function enableLocal() {
  if (!localApproval.value || busy.value) return
  busy.value = true
  try { await acceptLocalDataAccess(); toast.add({ title: 'VA data access enabled', color: 'success' }); emit('accepted') }
  catch { error.value = 'Could not save your choice. Try again.'; toast.add({ title: 'Could not enable VA data access', description: error.value, color: 'error' }) }
  finally { busy.value = false }
}

async function revoke() {
  try {
    await revokeCloudConsent()
    status.value = 'Cloud access revoked. Data already saved to VCH remains in your account.'
    toast.add({ title: 'Cloud access revoked', description: status.value, color: 'success' })
  } catch {
    error.value = 'Could not revoke cloud access. Try again.'
    toast.add({ title: 'Could not revoke cloud access', description: error.value, color: 'error' })
  }
}

async function clear() {
  busy.value = true
  try { await clearVaDataAndConsent(); toast.add({ title: 'Local VA data cleared', description: 'Local access and cloud permissions were revoked.', color: 'success' }); emit('cleared') }
  catch { error.value = 'Could not clear all data. Try again.'; toast.add({ title: 'Could not clear VA data', description: error.value, color: 'error' }) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="space-y-4 py-3 text-sm" aria-labelledby="privacy-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="privacy-heading" class="text-base font-semibold text-highlighted">Your VA data and privacy</h2>
      <UButton v-if="accepted" aria-label="Close privacy settings" icon="i-lucide-x" variant="ghost" color="error" @click="emit('close')" />
    </div>
    <p>With your permission, VCH reads claims, appeals, disability ratings, and profile details from your existing VA.gov session. Opening Letters checks which decision letters are available. Profile details can include your name, birth date, phone, service history, and the last four digits of your SSN.</p>
    <p>These details are saved in this browser so you can view them later. They are sensitive and are not encrypted by the extension. Use a private browser profile on a device you trust.</p>
    <p>Your VA password and VA session cookies are never sent to VCH. Optional imports read your VCH sign-in cookie to authenticate requests to your account. Selected data or PDFs leave your device only when you approve a VCH import.</p>
    <template v-if="!accepted">
      <UCheckbox v-model="localApproval" label="Allow VCH to read my signed-in VA.gov data and save it on this device." />
      <UButton :disabled="!localApproval || busy" :loading="busy" @click="enableLocal">Enable VA data access</UButton>
    </template>
    <template v-else>
      <p>Approve saving to your VCH account once in VA Profile. That choice covers claims and appeals, unlocked ratings and profile details, and decision letters you select.</p>
      <UButton variant="outline" @click="revoke">Revoke all cloud access</UButton>
      <UButton color="error" variant="outline" :loading="busy" @click="clear">Clear local VA data and revoke access</UButton>
      <p class="text-xs text-muted">Clearing here removes cached VA data and permissions from this extension. Delete imported documents and cloud data separately in your VCH account. Theme and display preferences are preserved.</p>
    </template>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <p v-if="status" role="status" class="text-success">{{ status }}</p>
    <a href="https://www.veteranscentralhub.com/privacy#vch-web-extension" target="_blank" rel="noopener noreferrer" class="text-sm underline">Read the VCH privacy policy</a>
    <p class="text-xs text-muted">Not affiliated with or endorsed by the U.S. Department of Veterans Affairs.</p>
  </section>
</template>
