<script setup lang="ts">
import { acceptLocalDataAccess, clearVaDataAndConsent } from '@/shared/privacyConsent'

defineProps<{ accepted: boolean }>()
const emit = defineEmits<{ accepted: [], cleared: [], close: [] }>()
const localApproval = ref(false)
const busy = ref(false)
const error = ref('')
const toast = useToast()

async function enableLocal() {
  if (!localApproval.value || busy.value) return
  busy.value = true
  try { await acceptLocalDataAccess(); toast.add({ title: 'VA data access enabled', color: 'success' }); emit('accepted') }
  catch { error.value = 'Could not save your choice. Try again.'; toast.add({ title: 'Could not enable VA data access', description: error.value, color: 'error' }) }
  finally { busy.value = false }
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
    <p>Your VA password and VA session cookies are never sent to VCH. Optional imports use your VCH sign-in to authenticate requests to your account. With sync approval and auto-sync enabled, claims and appeals sync when they change. Ratings and selected PDFs are saved when you choose Save.</p>
    <template v-if="!accepted">
      <UCheckbox v-model="localApproval" label="Allow VCH to read my signed-in VA.gov data and save it on this device." />
      <UButton :disabled="!localApproval || busy" :loading="busy" @click="enableLocal">Enable VA data access</UButton>
    </template>
    <template v-else>
      <p>Manage your VCH account’s sync approval and auto-sync in VA Profile under Sync Approved.</p>
      <UButton color="error" variant="outline" :loading="busy" @click="clear">Clear local VA data and revoke access</UButton>
      <p class="text-xs text-muted">Clearing here removes cached VA data and permissions from this extension. Delete imported documents and cloud data separately in your VCH account. Theme and display preferences are preserved.</p>
    </template>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <a href="https://www.veteranscentralhub.com/privacy#vch-web-extension" target="_blank" rel="noopener noreferrer" class="text-sm underline">Read the VCH privacy policy</a>
    <p class="text-xs text-muted">Not affiliated with or endorsed by the U.S. Department of Veterans Affairs.</p>
  </section>
</template>
