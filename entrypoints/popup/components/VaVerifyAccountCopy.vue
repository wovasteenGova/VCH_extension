<script setup lang="ts">
defineProps<{ variant?: 'help' | 'alert' }>()
</script>

<template>
  <span v-if="variant === 'alert'">
    Could not verify your VA.gov account. If you are already signed in,
    <strong class="font-semibold text-highlighted">refresh your VA.gov</strong>
    tab in this browser, then refresh here. If not, sign in on VA.gov and try again.
  </span>
  <span v-else>
    If you are already signed in on VA.gov,
    <strong class="font-semibold text-highlighted">refresh your VA.gov</strong>
    tab, wait for the page to load, then tap refresh in the extension.
  </span>
</template>
