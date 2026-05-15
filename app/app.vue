<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'de' },
  titleTemplate: (t: string | undefined) => (t ? `${t} · ace` : 'ace · TuS Neureut'),
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </UApp>
</template>
