<script setup lang="ts">
import type { RankingDetailDto, RankingVariant } from '~~/server/modules/rankings'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => Number(route.params.id))

const onlyActive = ref(true)

const url = computed(() => `/api/rankings/${id.value}?onlyActive=${onlyActive.value}`)

const { data: ranking } = await useFetch<RankingDetailDto>(url, { watch: [url] })

useHead({
  title: () =>
    ranking.value ? `${ranking.value.ageGroupName} · ${variantLabel[ranking.value.variant]}` : 'Rangliste',
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
  <UContainer v-if="ranking" class="py-6 max-w-3xl">
    <header class="mb-6">
      <NuxtLink to="/ranglisten" class="text-sm text-stone-500 hover:text-stone-800">
        ← Alle Ranglisten
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">
        {{ ranking.ageGroupName }} · {{ variantLabel[ranking.variant] }}
      </h1>
      <div class="text-sm text-stone-500 mt-1">
        {{ ranking.seasonName }} · {{ modeLabel[ranking.mode] }} · {{ ranking.entries.length }} Spieler
      </div>
    </header>

    <div class="mb-4">
      <UCheckbox v-model="onlyActive" label="nur aktive Spieler anzeigen" />
    </div>

    <ul v-if="ranking.entries.length > 0" class="divide-y divide-stone-200 border border-stone-200 rounded-lg overflow-hidden">
      <li
        v-for="e in ranking.entries"
        :key="e.id"
        class="px-4 py-3 flex items-center justify-between"
      >
        <div class="flex items-baseline gap-3">
          <div class="font-mono text-sm text-stone-500 min-w-[42px]">{{ e.display.primary }}</div>
          <div>
            <div class="font-medium">{{ e.member.firstName }} {{ e.member.lastName }}</div>
            <div class="text-xs text-stone-500">
              LK {{ e.member.dtbLk.toFixed(1) }}
              <span v-if="e.member.status === 'pausiert'" class="text-stone-400">· pausiert</span>
            </div>
          </div>
        </div>
        <div v-if="e.display.secondary" class="font-mono text-sm text-emerald-700">
          {{ e.display.secondary }}
        </div>
      </li>
    </ul>

    <p v-else class="text-stone-500 italic">
      Keine Einträge.
    </p>
  </UContainer>
</template>
