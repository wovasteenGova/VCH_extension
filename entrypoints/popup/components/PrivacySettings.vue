<script setup lang="ts">
import { acceptLocalDataAccess, clearVaDataAndConsent, grantCloudConsent, hasCloudConsent, revokeCloudConsent } from '@/shared/privacyConsent'
import { readHubSession } from '@/shared/hubSessionRead'

const props = defineProps<{ accepted: boolean }>()
const emit = defineEmits<{ accepted: [], cleared: [], close: [] }>()
const localApproval = ref(false)
const trackApproval = ref(false)
const trackEnabled = ref(false)
const busy = ref(false)
const error = ref('')
const status = ref('')
const account = ref('')

onMounted(async () => {
  trackEnabled.value = await hasCloudConsent('track')
  if (props.accepted) account.value = (await readHubSession()).label
})

async function enableLocal() {
  if (!localApproval.value || busy.value) return
  busy.value = true
  try { await acceptLocalDataAccess(); emit('accepted') }
  catch { error.value = 'Could not save your choice. Try again.' }
  finally { busy.value = false }
}

async function enableTrack() {
  if (!trackApproval.value || busy.value) return
  busy.value = true
  try { await grantCloudConsent('track'); trackEnabled.value = true; status.value = 'ClaimBuilder can now read your saved claims and appeals for cloud sync.' }
  catch (caught) { error.value = caught instanceof Error ? caught.message : 'Could not enable cloud sync.' }
  finally { busy.value = false }
}

async function revoke() {
  await revokeCloudConsent()
  trackEnabled.value = false
  trackApproval.value = false
  status.value = 'Cloud access revoked. Data already saved to VCH remains in your account.'
}

async function clear() {
  busy.value = true
  try { await clearVaDataAndConsent(); emit('cleared') }
  catch { error.value = 'Could not clear all data. Try again.' }
  finally { busy.value = false }
}
</script>

<template>
  <section class="space-y-4 py-3 text-sm" aria-labelledby="privacy-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="privacy-heading" class="text-base font-semibold text-highlighted">Your VA data and privacy</h2>
      <UButton v-if="accepted" aria-label="Close privacy settings" icon="i-lucide-x" variant="ghost" color="error" @click="emit('close')" />
    </div>
    <p>With your permission, VCH reads claims, appeals, disability ratings, and profile details from your existing VA.gov session. Profile details can include your name, birth date, phone, service history, and the last four digits of your SSN.</p>
    <p>These details are saved in this browser so you can view them later. They are sensitive and are not encrypted by the extension. Use a private browser profile on a device you trust.</p>
    <p>Your VA password and VA session cookies are never sent to VCH. Optional imports read your VCH sign-in cookie to authenticate requests to your account. Selected data or PDFs leave your device only when you approve a VCH import.</p>
    <template v-if="!accepted">
      <UCheckbox v-model="localApproval" label="Allow VCH to read my signed-in VA.gov data and save it on this device." />
      <UButton :disabled="!localApproval || busy" :loading="busy" @click="enableLocal">Enable VA data access</UButton>
    </template>
    <template v-else>
      <div class="space-y-3 rounded-lg border border-default p-3">
        <h3 class="font-semibold">Optional ClaimBuilder Track sync</h3>
        <p>Allow ClaimBuilder and the VCH Track page to receive your saved claims and appeals. Review the cloud sync confirmation there before saving. This permission lasts 30 days for the current VCH account.</p>
        <p v-if="account" class="text-muted">VCH: {{ account }}</p>
        <p v-if="trackEnabled" role="status" class="text-success">Track access enabled for this VCH account.</p>
        <template v-else>
          <UCheckbox v-model="trackApproval" label="Allow my saved claims and appeals to be shared with my signed-in VCH account." />
          <UButton :disabled="!trackApproval || busy" :loading="busy" @click="enableTrack">Allow Track sync</UButton>
        </template>
        <UButton variant="outline" @click="revoke">Revoke all cloud access</UButton>
      </div>
      <p>Decision letters have a separate selection and confirmation in the Letters tab. Ratings and profile imports have their own confirmation in Ratings.</p>
      <UButton color="error" variant="outline" :loading="busy" @click="clear">Clear local VA data and revoke access</UButton>
      <p class="text-xs text-muted">Clearing here removes cached VA data and permissions from this extension. Delete imported documents and cloud data separately in your VCH account. Theme and display preferences are preserved.</p>
    </template>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <p v-if="status" role="status" class="text-success">{{ status }}</p>
    <a href="https://www.veteranscentralhub.com/privacy#vch-web-extension" target="_blank" rel="noopener noreferrer" class="text-sm underline">Read the VCH privacy policy</a>
    <p class="text-xs text-muted">Not affiliated with or endorsed by the U.S. Department of Veterans Affairs.</p>
  </section>
</template>
