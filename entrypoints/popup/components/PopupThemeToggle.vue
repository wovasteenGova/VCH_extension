<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
</script>

<template>
  <UColorModeButton
    size="xs"
    color="neutral"
    variant="ghost"
    class="shrink-0"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
  />
</template>
