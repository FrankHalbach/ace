<script setup lang="ts">
import type { PlayerProfileDto } from '~~/server/modules/members'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: profile } = await useFetch<PlayerProfileDto>(
  () => `/api/members/${id.value}/profile`,
)

useHead({
  title: () => (profile.value ? `${profile.value.firstName} ${profile.value.lastName}` : 'Spieler'),
})

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}

function relativeDays(d: Date | string | null): string {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  if (days < 28) return `vor ${Math.floor(days / 7)} Wochen`
  return `vor ${Math.floor(days / 30)} Monaten`
}

function formatSets(sets: { a: number; b: number }[] | null): string {
  if (!sets || sets.length === 0) return ''
  return sets.map((s) => `${s.a}:${s.b}`).join(' · ')
}

const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const yearFmt = new Intl.DateTimeFormat('de-DE', { year: '2-digit' })

function dateChip(d: Date | string): { dm: string; year: string } {
  const date = new Date(d)
  return { dm: dayMonthFmt.format(date), year: `'${yearFmt.format(date)}` }
}

const totalMatches = computed(() => profile.value?.matches.length ?? 0)
const wins = computed(() =>
  (profile.value?.matches ?? []).filter((m) => m.result === 'win').length,
)
</script>

<template>
  <UContainer v-if="profile" class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        <span class="italic text-primary">{{ profile.firstName }}</span>
        <span class="ml-1.5">{{ profile.lastName }}</span>
      </h1>
      <p class="text-sm text-muted mt-2 inline-flex items-center gap-1.5 flex-wrap">
        <span>* {{ profile.birthYear }}</span>
        <span class="dot-sep" aria-hidden="true" />
        <span v-if="profile.status === 'pausiert'" class="text-[color:var(--warning)]">
          pausiert
        </span>
        <span v-else>aktiv</span>
        <template v-if="profile.email">
          <span class="dot-sep" aria-hidden="true" />
          <span class="font-mono tabular-nums text-xs">{{ profile.email }}</span>
        </template>
      </p>
    </header>

    <!-- STAT-STRIP -->
    <section class="anim anim-2 mb-10 md:mb-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 border-y border-default py-5">
      <div class="stat md:px-6 md:first:pl-0">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          DTB-LK
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ profile.dtbLk.toFixed(1) }}
        </p>
      </div>
      <div class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Spiele
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ totalMatches }}
          <span v-if="totalMatches > 0" class="text-base text-muted">·{{ wins }}S</span>
        </p>
      </div>
      <div class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          4 Wochen
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ profile.matchesLast4Weeks }}
        </p>
      </div>
      <div class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Aktiv
        </p>
        <p class="text-lg font-semibold leading-none mt-1">
          {{ relativeDays(profile.lastMatchAt) }}
        </p>
      </div>
    </section>

    <!-- RANGLISTEN -->
    <section class="anim anim-3 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Ranglisten · {{ profile.rankings.length }}</h2>
      </div>
      <ul
        v-if="profile.rankings.length > 0"
        class="divide-y divide-default border-y border-default"
      >
        <li v-for="r in profile.rankings" :key="r.rankingId">
          <NuxtLink :to="`/ranglisten/${r.rankingId}`" class="list-row group">
            <span class="font-mono tabular-nums text-sm font-semibold text-primary min-w-[3rem] text-center">
              #{{ r.position }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ r.ageGroupName }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ r.seasonName }} · {{ modeLabel[r.mode] ?? r.mode }}
              </div>
            </div>
            <span class="font-mono tabular-nums text-xs text-dimmed shrink-0">
              von {{ r.entryCount }}
            </span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted italic">
        In keiner aktiven Rangliste eingetragen.
      </p>
    </section>

    <!-- MATCH-HISTORIE -->
    <section class="anim anim-4">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Spiele · {{ totalMatches }}</h2>
      </div>
      <ul
        v-if="profile.matches.length > 0"
        class="divide-y divide-default border-y border-default"
      >
        <li
          v-for="(m, i) in profile.matches"
          :key="`${m.kind}-${i}`"
        >
          <NuxtLink
            v-if="m.kind === 'challenge'"
            :to="`/challenges/${m.challengeId}`"
            class="list-row group"
          >
            <span class="date-chip font-mono shrink-0">
              <span class="text-xs font-semibold tabular-nums leading-none">
                {{ dateChip(m.completedAt).dm }}
              </span>
              <span class="text-[10px] text-dimmed tabular-nums leading-none mt-1">
                {{ dateChip(m.completedAt).year }}
              </span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                <span class="text-muted font-normal mr-1">vs</span>{{ m.opponentName }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                Forderung · {{ m.rankingName }}
                <span v-if="formatSets(m.sets)" class="font-mono tabular-nums ml-1">· {{ formatSets(m.sets) }}</span>
              </div>
            </div>
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
              :class="m.result === 'win' ? 'text-[color:var(--success)]' : 'text-muted'"
            >
              {{ m.result === 'win' ? 'Sieg' : 'Niederlage' }}
            </span>
          </NuxtLink>

          <NuxtLink
            v-else
            :to="`/friendlies/${m.friendlyId}`"
            class="list-row group"
          >
            <span class="date-chip font-mono shrink-0">
              <span class="text-xs font-semibold tabular-nums leading-none">
                {{ dateChip(m.playedOrCompletedAt).dm }}
              </span>
              <span class="text-[10px] text-dimmed tabular-nums leading-none mt-1">
                {{ dateChip(m.playedOrCompletedAt).year }}
              </span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                <span class="text-muted font-normal mr-1">vs</span>{{ m.opponentNames.join(', ') }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ m.format === 'singles' ? 'Einzel' : 'Doppel' }}-Freundschaftsspiel
                <template v-if="m.format === 'doubles' && m.partnerName">
                  · mit {{ m.partnerName }}
                </template>
                <span v-if="formatSets(m.sets)" class="font-mono tabular-nums ml-1">· {{ formatSets(m.sets) }}</span>
              </div>
            </div>
            <span
              v-if="m.result"
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
              :class="m.result === 'win' ? 'text-[color:var(--success)]' : 'text-muted'"
            >
              {{ m.result === 'win' ? 'Sieg' : 'Niederlage' }}
            </span>
            <span
              v-else
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0 text-dimmed"
            >
              gespielt
            </span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted italic">
        Noch keine Spiele.
      </p>
    </section>
  </UContainer>
</template>
