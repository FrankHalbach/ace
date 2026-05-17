<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

useHead({ title: 'Admin' })
</script>

<template>
  <UContainer class="py-10 max-w-3xl md:py-14">
    <h1 class="text-2xl font-semibold mb-2">Admin</h1>
    <p class="text-muted mb-8">
      Verwalte Saisons, Mitglieder und Plattform-Konfiguration.
    </p>

    <div class="space-y-3">
      <NuxtLink
        to="/admin/seasons"
        class="block p-4 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="font-medium text-default">Saisons &amp; Altersgruppen</div>
        <div class="text-sm text-muted">Saisons anlegen, Status steuern, Altersgruppen pflegen</div>
      </NuxtLink>

      <div class="block p-4 border border-default rounded-lg opacity-50">
        <div class="font-medium text-default">Mitglieder</div>
        <div class="text-sm text-muted">folgt mit dem admin-Feature</div>
      </div>

      <div class="block p-4 border border-default rounded-lg opacity-50">
        <div class="font-medium text-default">Audit-Log</div>
        <div class="text-sm text-muted">folgt mit dem admin-Feature</div>
      </div>
    </div>
  </UContainer>
</template>
