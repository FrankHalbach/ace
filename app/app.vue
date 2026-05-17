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
      <!--
        page-key = fullPath erzwingt einen kompletten Re-Mount der Page-
        Komponente bei jeder URL-Änderung. Notwendig, weil mehrere Pages
        (z. B. /friendlies/[id], /challenges/[id]) ihre Daten via
        `await useFetch` im setup() ziehen — ohne Re-Mount läuft setup
        nicht erneut, und die Seite zeigt stale Daten beim Wechsel auf
        eine andere ID (z. B. via Termine-Rail). Kleiner Re-Render-Flash
        ist der Tradeoff, akzeptabel für eine Vereins-App.
      -->
      <NuxtPage :page-key="(route) => route.fullPath" />
    </NuxtLayout>
  </UApp>
</template>
