<script setup lang="ts">
import type { RankingSummaryDto } from '~~/server/modules/rankings'
import type { SeasonDto, SeasonId } from '~~/server/modules/seasons'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Ranglisten' })

const { data: seasons } = await useFetch<SeasonDto[]>('/api/seasons', { default: () => [] })

const selectedSeasonId = ref<SeasonId | undefined>(undefined)

// Default-Saison setzen, sobald die Liste da ist
watchEffect(() => {
  if (selectedSeasonId.value !== undefined) return
  const list = seasons.value
  if (!list || list.length === 0) return
  const active = list.find((s) => s.status === 'ACTIVE') ?? list[0]
  if (!active) return
  selectedSeasonId.value = active.id
})

const seasonItems = computed(() =>
  (seasons.value ?? []).map((s) => ({ label: `${s.name} (${s.status})`, value: s.id })),
)

const { data: rankings } = await useFetch<RankingSummaryDto[]>(
  () => `/api/rankings?seasonId=${selectedSeasonId.value ?? ''}`,
  { default: () => [] },
)

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Ranglisten
      </h1>
      <p class="text-sm text-muted mt-2">
        Pyramide, Punkte-Tabelle oder ELO — pro Konkurrenz eigene Wertung.
      </p>
    </header>

    <!-- SAISON-PICKER -->
    <div v-if="seasonItems.length > 0" class="anim anim-2 mb-8 flex items-center gap-3 flex-wrap">
      <span class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted">
        Saison
      </span>
      <USelect
        v-model="selectedSeasonId"
        :items="seasonItems"
        class="min-w-[220px]"
      />
    </div>

    <!-- LISTE -->
    <section class="anim anim-3">
      <p v-if="seasonItems.length === 0" class="text-muted italic">
        Noch keine Saisons angelegt.
      </p>

      <p v-else-if="rankings.length === 0" class="text-muted italic">
        Keine Ranglisten für die aktuelle Auswahl.
      </p>

      <ul v-else class="divide-y divide-default border-y border-default">
        <li v-for="r in rankings" :key="r.id">
          <NuxtLink :to="`/ranglisten/${r.id}`" class="list-row group">
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted ring-1 ring-default rounded px-1.5 py-1 min-w-[5.5rem] text-center shrink-0"
            >
              {{ modeLabel[r.mode] }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                <span class="italic text-primary">{{ r.ageGroupName }}</span>
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                <span class="font-mono tabular-nums">{{ r.entryCount }}</span>
                Spieler
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="text-dimmed shrink-0 group-hover:text-primary transition-colors" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
