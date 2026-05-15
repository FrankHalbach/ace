<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin',
})

useHead({ title: 'Admin' })
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold mb-2">Admin</h1>
    <p class="text-stone-600 mb-8">
      Verwalte Saisons, Mitglieder und Plattform-Konfiguration.
    </p>

    <div class="space-y-3">
      <NuxtLink
        to="/admin/seasons"
        class="block p-4 border border-stone-200 rounded-lg hover:border-emerald-600 hover:bg-emerald-50 transition"
      >
        <div class="font-medium text-stone-800">Saisons &amp; Altersgruppen</div>
        <div class="text-sm text-stone-500">Saisons anlegen, Lifecycle steuern, Altersgruppen pflegen</div>
      </NuxtLink>

      <div class="block p-4 border border-stone-200 rounded-lg opacity-50">
        <div class="font-medium text-stone-800">Mitglieder</div>
        <div class="text-sm text-stone-500">folgt mit dem admin-Feature</div>
      </div>

      <div class="block p-4 border border-stone-200 rounded-lg opacity-50">
        <div class="font-medium text-stone-800">Audit-Log</div>
        <div class="text-sm text-stone-500">folgt mit dem admin-Feature</div>
      </div>
    </div>
  </div>
</template>
