<script setup lang="ts">
import type { PlayerProfileDto } from '~~/server/modules/members'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: profile } = await useFetch<PlayerProfileDto>(
  () => `/api/members/${id.value}/profile`,
)

useHead({
  title: () => (profile.value ? `${profile.value.firstName} ${profile.value.lastName}` : 'Spieler'),
})

const variantLabel: Record<'herren' | 'damen' | 'offen', string> = {
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

function relativeDays(d: Date | string | null): string {
  if (!d) return '– noch nie –'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function formatSets(sets: { a: number; b: number }[] | null): string {
  if (!sets || sets.length === 0) return ''
  return sets.map((s) => `${s.a}:${s.b}`).join(', ')
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
</script>

<template>
  <UContainer v-if="profile" class="py-6 max-w-3xl">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">
        {{ profile.firstName }} {{ profile.lastName }}
      </h1>
      <div class="text-sm text-muted mt-1">
        LK {{ profile.dtbLk.toFixed(1) }} ·
        <span v-if="profile.status === 'aktiv'">aktiv</span>
        <span v-else class="text-dimmed">pausiert</span>
        · *{{ profile.birthYear }}
      </div>
      <div class="text-sm text-muted mt-1">
        Letzte Aktivität: {{ relativeDays(profile.lastMatchAt) }} ·
        {{ profile.matchesLast4Weeks }} Match{{ profile.matchesLast4Weeks === 1 ? '' : 'es' }} in 4 Wochen
      </div>
      <div v-if="profile.email" class="text-xs text-dimmed mt-2 font-mono">
        {{ profile.email }}
      </div>
    </header>

    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Aktuelle Ranglisten</h2>
      <ul
        v-if="profile.rankings.length > 0"
        class="divide-y divide-default border border-default rounded-lg overflow-hidden"
      >
        <li
          v-for="r in profile.rankings"
          :key="r.rankingId"
          class="px-4 py-3 flex items-center justify-between"
        >
          <NuxtLink :to="`/ranglisten/${r.rankingId}`" class="hover:text-primary transition">
            <div class="font-medium">
              {{ r.ageGroupName }} · {{ variantLabel[r.variant] }}
            </div>
            <div class="text-xs text-muted">
              {{ r.seasonName }} · {{ modeLabel[r.mode] ?? r.mode }}
            </div>
          </NuxtLink>
          <div class="font-mono text-sm">
            #{{ r.position }}<span class="text-dimmed">/{{ r.entryCount }}</span>
          </div>
        </li>
      </ul>
      <p v-else class="text-muted italic">In keiner aktiven Rangliste eingetragen.</p>
    </section>

    <section>
      <h2 class="text-lg font-semibold mb-3">Match-Historie</h2>
      <p v-if="profile.matches.length === 0" class="text-muted italic">
        Noch keine Spiele.
      </p>

      <ul v-else class="divide-y divide-default border border-default rounded-lg overflow-hidden">
        <li
          v-for="(m, i) in profile.matches"
          :key="`${m.kind}-${i}`"
          class="px-4 py-3"
        >
          <div v-if="m.kind === 'challenge'" class="flex items-center justify-between gap-3">
            <NuxtLink :to="`/challenges/${m.challengeId}`" class="flex-1 min-w-0 hover:text-primary transition">
              <div class="font-medium truncate">
                Forderung gegen {{ m.opponentName }}
                <span
                  class="ml-2 text-xs font-mono"
                  :class="m.result === 'win' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'"
                >
                  {{ m.result === 'win' ? 'Sieg' : 'Niederlage' }}
                </span>
              </div>
              <div class="text-xs text-muted">
                {{ formatDate(m.completedAt) }} · {{ m.rankingName }}
                <span v-if="formatSets(m.sets)" class="font-mono ml-2">{{ formatSets(m.sets) }}</span>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="flex items-center justify-between gap-3">
            <NuxtLink :to="`/friendlies/${m.friendlyId}`" class="flex-1 min-w-0 hover:text-primary transition">
              <div class="font-medium truncate">
                {{ m.format === 'singles' ? 'Einzel' : 'Doppel' }}-Friendly
                <span v-if="m.format === 'doubles' && m.partnerName"> mit {{ m.partnerName }}</span>
                gegen
                <template v-for="(name, j) in m.opponentNames" :key="j">
                  {{ name }}<span v-if="j < m.opponentNames.length - 1">, </span>
                </template>
                <span
                  v-if="m.result"
                  class="ml-2 text-xs font-mono"
                  :class="m.result === 'win' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'"
                >
                  {{ m.result === 'win' ? 'Sieg' : 'Niederlage' }}
                </span>
                <span v-else class="ml-2 text-xs font-mono text-muted">gespielt</span>
              </div>
              <div class="text-xs text-muted">
                {{ formatDate(m.playedOrCompletedAt) }}
                <span v-if="formatSets(m.sets)" class="font-mono ml-2">{{ formatSets(m.sets) }}</span>
              </div>
            </NuxtLink>
          </div>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
