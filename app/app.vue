<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'de' },
  titleTemplate: (t: string | undefined) => (t ? `${t} · ace` : 'ace · TuS Neureut'),
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
