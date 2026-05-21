<script setup lang="ts">
import type { RankingDetailDto } from '~~/server/modules/rankings'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))

const onlyActive = ref(true)
const url = computed(() => `/api/rankings/${id.value}?onlyActive=${onlyActive.value}`)

const { data: ranking, refresh } = await useFetch<RankingDetailDto>(url, { watch: [url] })

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}

useHead({
  title: () => ranking.value?.ageGroupName ?? 'Rangliste',
})

const { user } = useUserSession()
const toast = useToast()
const challenging = ref<string | null>(null)

async function challenge(targetMemberId: string) {
  if (!ranking.value) return
  challenging.value = targetMemberId
  try {
    await $fetch('/api/challenges', {
      method: 'POST',
      body: { challengedId: targetMemberId, rankingId: ranking.value.id },
    })
    toast.add({ title: 'Forderung versendet', color: 'primary' })
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: 'Forderung fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    challenging.value = null
  }
}

type RankingEntry = RankingDetailDto['entries'][number]

const viewerEntry = computed<RankingEntry | null>(() => {
  if (!user.value || !ranking.value) return null
  return ranking.value.entries.find((e: RankingEntry) => e.memberId === user.value!.memberId) ?? null
})

function canChallenge(targetMemberId: string, targetStatus: string): boolean {
  if (!user.value) return false
  if (!viewerEntry.value) return false
  if (user.value.memberId === targetMemberId) return false
  if (targetStatus === 'pausiert') return false
  return true
}
</script>

<template>
  <UContainer v-if="ranking" class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <NuxtLink
        to="/ranglisten"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1 mb-3"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Ranglisten
      </NuxtLink>
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        <span class="italic text-primary">{{ ranking.ageGroupName }}</span>
      </h1>
      <p class="text-sm text-muted mt-2 inline-flex items-center gap-1.5 flex-wrap">
        <span>{{ ranking.seasonName }}</span>
        <span class="dot-sep" aria-hidden="true" />
        <span class="font-mono tabular-nums text-xs uppercase tracking-[0.14em]">
          {{ modeLabel[ranking.mode] }}
        </span>
      </p>
    </header>

    <!-- VIEWER STAT-STRIP -->
    <section
      v-if="viewerEntry"
      class="anim anim-2 mb-10 md:mb-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 border-y border-default py-5"
    >
      <div class="stat md:px-6 md:first:pl-0">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Position
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none text-primary">
          {{ viewerEntry.display.primary }}
        </p>
      </div>
      <div v-if="viewerEntry.display.secondary" class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Punkte
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ viewerEntry.display.secondary }}
        </p>
      </div>
      <div class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Spiele
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ viewerEntry.matchesPlayed }}
        </p>
      </div>
      <div class="stat md:px-6">
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5">
          Siege
        </p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ viewerEntry.matchesWon }}
        </p>
      </div>
    </section>

    <!-- HINT: nicht in Rangliste -->
    <p
      v-if="user && !viewerEntry"
      class="anim anim-2 mb-6 text-sm text-muted flex items-center gap-2"
    >
      <UIcon name="i-lucide-info" class="size-4 shrink-0" />
      Du stehst nicht in dieser Rangliste — Forderungen sind hier nicht möglich.
    </p>

    <!-- TABLEAU -->
    <section class="anim anim-3">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Tableau · {{ ranking.entries.length }}</h2>
        <UCheckbox v-model="onlyActive" label="nur aktive" />
      </div>

      <ul
        v-if="ranking.entries.length > 0"
        class="divide-y divide-default border-y border-default"
      >
        <li
          v-for="e in ranking.entries"
          :key="e.id"
          class="list-row"
          :class="{ 'bg-primary/5': user && e.memberId === user.memberId }"
        >
          <span
            class="font-mono tabular-nums text-sm font-semibold min-w-[2.75rem] text-center px-1.5 py-1 rounded ring-1"
            :class="user && e.memberId === user.memberId
              ? 'ring-primary text-primary'
              : 'ring-default text-muted'"
          >
            {{ e.display.primary }}
          </span>

          <NuxtLink :to="`/spieler/${e.memberId}`" class="flex-1 min-w-0 group">
            <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
              <span class="italic text-primary">{{ e.member.firstName }}</span>
              <span class="ml-1">{{ e.member.lastName }}</span>
            </div>
            <div class="text-xs text-muted truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span class="font-mono tabular-nums">LK {{ e.member.dtbLk.toFixed(1) }}</span>
              <span class="dot-sep" aria-hidden="true" />
              <span class="font-mono tabular-nums">
                {{ e.matchesWon }}/{{ e.matchesPlayed }}
              </span>
              <template v-if="e.member.status === 'pausiert'">
                <span class="dot-sep" aria-hidden="true" />
                <span class="text-[color:var(--neutral,var(--ink-soft))]">pausiert</span>
              </template>
            </div>
          </NuxtLink>

          <div class="flex items-center gap-3 shrink-0">
            <span
              v-if="e.display.secondary"
              class="font-mono tabular-nums text-sm text-muted"
              :title="'Punkte'"
            >
              {{ e.display.secondary }}
            </span>
            <UButton
              v-if="canChallenge(e.memberId, e.member.status)"
              size="xs"
              color="primary"
              icon="i-lucide-swords"
              :loading="challenging === e.memberId"
              @click="challenge(e.memberId)"
            >
              Fordern
            </UButton>
          </div>
        </li>
      </ul>

      <p v-else class="text-sm text-muted italic py-8 text-center">
        Noch keine Einträge in dieser Rangliste.
      </p>
    </section>
  </UContainer>
</template>
