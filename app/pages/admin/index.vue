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

      <NuxtLink
        to="/team-tags"
        class="block p-4 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="font-medium text-default">Mannschaften</div>
        <div class="text-sm text-muted">Mannschafts-Tags pflegen — gemeinsam mit Trainern</div>
      </NuxtLink>

      <NuxtLink
        to="/admin/members"
        class="block p-4 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="font-medium text-default">Mitglieder</div>
        <div class="text-sm text-muted">Liste, Rollen pflegen — CSV-Import und Einladungen folgen</div>
      </NuxtLink>

      <NuxtLink
        to="/admin/audit"
        class="block p-4 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="font-medium text-default">Audit-Log</div>
        <div class="text-sm text-muted">Wer hat wann was geändert — filterbar nach Aktion, Akteur und Zeitraum</div>
      </NuxtLink>
    </div>
  </UContainer>
</template>
