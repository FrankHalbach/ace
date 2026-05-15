<script setup lang="ts">
import type { RankingSummaryDto, RankingVariant } from '~~/server/modules/rankings'
import type { SeasonDto } from '~~/server/modules/seasons'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Ranglisten' })

const { data: seasons } = await useFetch<SeasonDto[]>('/api/seasons', { default: () => [] })

const selectedSeasonId = ref<number | null>(null)
const selectedVariant = ref<RankingVariant | 'alle'>('alle')

// Default-Saison setzen, sobald die Liste da ist
watchEffect(() => {
  if (selectedSeasonId.value !== null) return
  const list = seasons.value
  if (!list || list.length === 0) return
  const active = list.find((s) => s.status === 'ACTIVE') ?? list[0]
  selectedSeasonId.value = active.id
})

// Stabile Items-Computeds — USelect mag keine neu-erzeugten Arrays pro Render
const seasonItems = computed(() =>
  (seasons.value ?? []).map((s) => ({ label: `${s.name} (${s.status})`, value: s.id })),
)
const variantItems = [
  { label: 'Alle Varianten', value: 'alle' as const },
  { label: 'Herren', value: 'herren' as const },
  { label: 'Damen', value: 'damen' as const },
  { label: 'Offen', value: 'offen' as const },
]

const rankingsUrl = computed(() => {
  if (!selectedSeasonId.value) return null
  const params = new URLSearchParams({ seasonId: String(selectedSeasonId.value) })
  if (selectedVariant.value !== 'alle') params.set('variant', selectedVariant.value)
  return `/api/rankings?${params.toString()}`
})

const { data: rankings } = await useFetch<RankingSummaryDto[]>(rankingsUrl, {
  watch: [rankingsUrl],
  default: () => [],
})

const variantLabel: Record<RankingVariant, string> = {
  herren: 'Herren',
  damen: 'Damen',
  offen: 'Offen',
}

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">Ranglisten</h1>
      <NuxtLink to="/" class="text-sm text-stone-500 hover:text-stone-800">← Start</NuxtLink>
    </header>

    <div v-if="seasonItems.length > 0" class="flex flex-wrap gap-3 mb-6">
      <USelect
        v-model="selectedSeasonId"
        :items="seasonItems"
        class="min-w-[200px]"
      />
      <USelect
        v-model="selectedVariant"
        :items="variantItems"
        class="min-w-[180px]"
      />
    </div>

    <p v-if="seasonItems.length === 0" class="text-stone-500 italic">
      Noch keine Saisons angelegt.
    </p>

    <p v-else-if="rankings.length === 0" class="text-stone-500 italic">
      Keine Ranglisten für die aktuelle Auswahl.
    </p>

    <div v-else class="space-y-2">
      <NuxtLink
        v-for="r in rankings"
        :key="r.id"
        :to="`/ranglisten/${r.id}`"
        class="block p-3 border border-stone-200 rounded-lg hover:border-emerald-600 hover:bg-stone-50 transition"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">{{ r.ageGroupName }} · {{ variantLabel[r.variant] }}</div>
            <div class="text-xs text-stone-500">
              {{ modeLabel[r.mode] }} · {{ r.entryCount }} Spieler
            </div>
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-stone-400" />
        </div>
      </NuxtLink>
    </div>
  </UContainer>
</template>
