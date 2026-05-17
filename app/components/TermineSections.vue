<script setup lang="ts">
import type { TermineItem } from '../composables/useTermine'

/**
 * Rendert die zwei Termine-Sections (Als nächstes + Geplant). Wird vom
 * Layout-Right-Rail (xl+) und von der Home-Page inline (< xl) genutzt —
 * damit Mobile-User die wichtigsten Termine nicht verlieren, wenn der
 * Rail nicht im Viewport ist.
 */
defineProps<{
  nextMatch: TermineItem | null
  upcomingRest: TermineItem[]
}>()
</script>

<template>
  <section v-if="nextMatch">
    <div class="section-head__wrap mb-3">
      <h2 class="section-head">Als nächstes</h2>
      <NuxtLink
        to="/friendlies"
        class="text-xs text-muted hover:text-primary inline-flex items-center gap-1 transition-colors"
      >
        Alle Termine
        <UIcon name="i-lucide-arrow-right" class="size-3.5" />
      </NuxtLink>
    </div>
    <NuxtLink :to="nextMatch.to" class="next-card group">
      <div class="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5">
        <div class="next-card__chip">
          <span class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted leading-none">
            {{ dateChip(nextMatch.scheduledAt).day }}
          </span>
          <span class="mono text-[22px] font-bold tabular-nums text-primary leading-none mt-1.5 tracking-[-0.02em]">
            {{ dateChip(nextMatch.scheduledAt).num }}
          </span>
          <span class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted leading-none mt-1">
            {{ dateChip(nextMatch.scheduledAt).mon }}
          </span>
        </div>
        <div class="min-w-0">
          <p class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)] leading-none mb-2 inline-flex items-center gap-2">
            <span class="next-card__pulse" aria-hidden="true" />
            {{ relativeUpcoming(nextMatch.scheduledAt) }}
          </p>
          <h3 class="text-base font-semibold tracking-[-0.005em] truncate leading-snug">
            {{ nextMatch.primary }}
          </h3>
          <p v-if="nextMatch.courtInfo" class="text-sm text-muted mt-1 truncate">
            {{ nextMatch.courtInfo }}
          </p>
        </div>
        <UIcon name="i-lucide-arrow-right" class="size-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </NuxtLink>
  </section>

  <section v-if="upcomingRest.length > 0" :class="{ 'mt-10': nextMatch }">
    <div class="section-head__wrap mb-3">
      <h2 class="section-head">Geplant · {{ upcomingRest.length }}</h2>
    </div>
    <ul class="divide-y divide-default border-y border-default">
      <li v-for="item in upcomingRest" :key="item.key">
        <NuxtLink :to="item.to" class="list-row group">
          <span class="date-chip shrink-0">
            <span class="mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted leading-none">
              {{ item.scheduledAt.toLocaleDateString('de-DE', { weekday: 'short' }) }}
            </span>
            <span class="mono text-sm font-bold tabular-nums text-primary leading-none mt-1 tracking-[-0.01em]">
              {{ item.scheduledAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }}
            </span>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
              {{ item.primary }}
            </div>
            <div class="text-xs text-muted truncate mt-0.5">
              {{ item.scheduledAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr<span v-if="item.courtInfo"> · {{ item.courtInfo }}</span>
            </div>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
