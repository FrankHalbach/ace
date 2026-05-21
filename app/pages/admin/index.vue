<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

useHead({ title: 'Admin' })

const tiles = [
  {
    to: '/admin/seasons',
    icon: 'i-lucide-calendar-range',
    title: 'Saisons & Altersgruppen',
    sub: 'Saisons anlegen, Status steuern, Altersgruppen pflegen',
  },
  {
    to: '/team-tags',
    icon: 'i-lucide-users',
    title: 'Mannschaften',
    sub: 'Mannschafts-Tags pflegen — gemeinsam mit Trainern',
  },
  {
    to: '/admin/members',
    icon: 'i-lucide-id-card',
    title: 'Mitglieder',
    sub: 'Liste, Rollen, CSV-Import, Einladungen, LK-Korrektur und Deaktivierung',
  },
  {
    to: '/admin/audit',
    icon: 'i-lucide-history',
    title: 'Audit-Log',
    sub: 'Wer hat wann was geändert — filterbar nach Aktion, Akteur und Zeitraum',
  },
] as const
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Admin
      </h1>
      <p class="text-sm text-muted mt-2">
        Saisons, Mitglieder, Mannschaften und Audit-Trail.
      </p>
    </header>

    <!-- BEREICHE -->
    <section class="anim anim-2">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Bereiche</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="t in tiles" :key="t.to">
          <NuxtLink :to="t.to" class="list-row group">
            <span class="lead-icon lead-icon--friendly">
              <UIcon :name="t.icon" class="size-4" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ t.title }}
              </div>
              <div class="text-xs text-muted mt-0.5">
                {{ t.sub }}
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="text-dimmed shrink-0 group-hover:text-primary transition-colors" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
