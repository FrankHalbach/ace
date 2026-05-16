<script setup lang="ts">
import type { RankingSummaryDto } from '~~/server/modules/rankings'
import type { SeasonDto } from '~~/server/modules/seasons'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Ranglisten' })

const { data: seasons } = await useFetch<SeasonDto[]>('/api/seasons', { default: () => [] })

const selectedSeasonId = ref<number | null>(null)

// Default-Saison setzen, sobald die Liste da ist
watchEffect(() => {
  if (selectedSeasonId.value !== null) return
  const list = seasons.value
  if (!list || list.length === 0) return
  const active = list.find((s) => s.status === 'ACTIVE') ?? list[0]
  selectedSeasonId.value = active.id
})

const seasonItems = computed(() =>
  (seasons.value ?? []).map((s) => ({ label: `${s.name} (${s.status})`, value: s.id })),
)

const rankingsUrl = computed(() => {
  if (!selectedSeasonId.value) return null
  const params = new URLSearchParams({ seasonId: String(selectedSeasonId.value) })
  return `/api/rankings?${params.toString()}`
})

const { data: rankings } = await useFetch<RankingSummaryDto[]>(rankingsUrl, {
  watch: [rankingsUrl],
  default: () => [],
})

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <h1 class="text-2xl font-semibold mb-6">Ranglisten</h1>

    <div v-if="seasonItems.length > 0" class="flex flex-wrap gap-3 mb-6">
      <USelect
        v-model="selectedSeasonId"
        :items="seasonItems"
        class="min-w-[200px]"
      />
    </div>

    <p v-if="seasonItems.length === 0" class="text-muted italic">
      Noch keine Saisons angelegt.
    </p>

    <p v-else-if="rankings.length === 0" class="text-muted italic">
      Keine Ranglisten für die aktuelle Auswahl.
    </p>

    <div v-else class="space-y-2">
      <NuxtLink
        v-for="r in rankings"
        :key="r.id"
        :to="`/ranglisten/${r.id}`"
        class="block p-3 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">{{ r.ageGroupName }}</div>
            <div class="text-xs text-muted">
              {{ modeLabel[r.mode] }} · {{ r.entryCount }} Spieler
            </div>
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-dimmed" />
        </div>
      </NuxtLink>
    </div>
  </UContainer>
</template>
