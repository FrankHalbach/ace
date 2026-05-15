<script setup lang="ts">
import type { RankingSummaryDto, RankingVariant } from '~~/server/modules/rankings'
import type { SeasonDto } from '~~/server/modules/seasons'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Ranglisten' })

const { data: seasons } = await useFetch<SeasonDto[]>('/api/seasons')

// Saison-Filter: standardmäßig die zuletzt erstellte aktive Saison
const selectedSeasonId = ref<number | null>(null)
watchEffect(() => {
  if (selectedSeasonId.value === null && seasons.value && seasons.value.length > 0) {
    const active = seasons.value.find((s) => s.status === 'ACTIVE') ?? seasons.value[0]
    selectedSeasonId.value = active.id
  }
})

const selectedVariant = ref<RankingVariant | 'alle'>('alle')

const rankingsUrl = computed(() => {
  if (!selectedSeasonId.value) return null
  const params = new URLSearchParams({ seasonId: String(selectedSeasonId.value) })
  if (selectedVariant.value !== 'alle') params.set('variant', selectedVariant.value)
  return `/api/rankings?${params.toString()}`
})

const { data: rankings } = await useFetch<RankingSummaryDto[]>(rankingsUrl, {
  watch: [rankingsUrl],
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

    <div class="flex flex-wrap gap-3 mb-6">
      <USelect
        v-if="seasons && seasons.length > 0"
        v-model="selectedSeasonId"
        :items="seasons.map((s) => ({ label: `${s.name} (${s.status})`, value: s.id }))"
        class="min-w-[200px]"
      />
      <USelect
        v-model="selectedVariant"
        :items="[
          { label: 'Alle Varianten', value: 'alle' },
          { label: 'Herren', value: 'herren' },
          { label: 'Damen', value: 'damen' },
          { label: 'Offen', value: 'offen' },
        ]"
        class="min-w-[180px]"
      />
    </div>

    <p v-if="rankings?.length === 0" class="text-stone-500 italic">
      Keine Ranglisten in dieser Saison.
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
