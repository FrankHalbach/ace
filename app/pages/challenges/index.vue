<script setup lang="ts">
import type { ChallengeDto, ChallengeStatus } from '~~/server/modules/challenges'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Forderungen' })

const { user } = useUserSession()
const { name: memberName } = await useMemberLookup()
const { data: challenges } = await useFetch<ChallengeDto[]>('/api/challenges', {
  default: () => [],
})

const me = computed(() => user.value?.memberId ?? null)

const incoming = computed(() =>
  (challenges.value ?? []).filter(
    (c) => c.challengedId === me.value && c.status === 'PROPOSED',
  ),
)
const outgoing = computed(() =>
  (challenges.value ?? []).filter(
    (c) => c.challengerId === me.value && c.status === 'PROPOSED',
  ),
)
const active = computed(() =>
  (challenges.value ?? []).filter((c) => c.status === 'ACCEPTED'),
)
const history = computed(() =>
  (challenges.value ?? []).filter((c) =>
    ['COMPLETED', 'DECLINED', 'EXPIRED', 'DISPUTED', 'CANCELLED'].includes(c.status),
  ),
)

const totalCount = computed(
  () =>
    incoming.value.length
    + outgoing.value.length
    + active.value.length
    + history.value.length,
)

const statusLabel: Record<ChallengeStatus, string> = {
  PROPOSED: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
  CANCELLED: 'Storniert',
}

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'dimmed'
const statusTone: Record<ChallengeStatus, StatusTone> = {
  PROPOSED: 'neutral',
  ACCEPTED: 'warning',
  DECLINED: 'danger',
  EXPIRED: 'dimmed',
  COMPLETED: 'success',
  DISPUTED: 'warning',
  CANCELLED: 'dimmed',
}

function otherParty(c: ChallengeDto): string {
  return c.challengerId === me.value ? c.challengedId : c.challengerId
}

function relativeDe(d: string | Date): string {
  const date = new Date(d)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function historyDate(c: ChallengeDto): string {
  const d = c.completedAt ?? c.declinedAt ?? c.expiredAt ?? c.cancelledAt ?? c.disputedAt ?? c.createdAt
  return new Date(d).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Forderungen
      </h1>
      <p v-if="totalCount > 0" class="text-sm text-muted mt-2">
        {{ totalCount }} {{ totalCount === 1 ? 'Forderung' : 'Forderungen' }} insgesamt.
      </p>
    </header>

    <!-- EINGEHEND -->
    <section v-if="incoming.length > 0" class="anim anim-2 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Eingehend · {{ incoming.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="c in incoming" :key="c.id">
          <NuxtLink :to="`/challenges/${c.id}`" class="list-row group">
            <span class="lead-icon lead-icon--challenge shrink-0">
              <UIcon name="i-lucide-swords" class="size-[18px]" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ memberName(otherParty(c)) }} fordert dich
              </div>
              <div class="text-xs text-muted truncate mt-0.5 inline-flex items-center gap-1.5">
                <span class="badge-new" aria-label="Neu">
                  <span class="badge-new__dot" aria-hidden="true" />
                  Neu
                </span>
                <span class="dot-sep" aria-hidden="true" />
                <span class="truncate">{{ c.rankingName }} · {{ relativeDe(c.createdAt) }}</span>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- AUSGEHEND -->
    <section v-if="outgoing.length > 0" class="anim anim-3 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Ausgehend · {{ outgoing.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="c in outgoing" :key="c.id">
          <NuxtLink :to="`/challenges/${c.id}`" class="list-row group">
            <span class="lead-icon lead-icon--challenge shrink-0">
              <UIcon name="i-lucide-swords" class="size-[18px]" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                Du forderst {{ memberName(otherParty(c)) }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ c.rankingName }} · wartet auf Antwort
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- AKTIV -->
    <section v-if="active.length > 0" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Aktiv · {{ active.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="c in active" :key="c.id">
          <NuxtLink :to="`/challenges/${c.id}`" class="list-row group">
            <span class="lead-icon lead-icon--challenge shrink-0">
              <UIcon name="i-lucide-swords" class="size-[18px]" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                vs {{ memberName(otherParty(c)) }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ c.rankingName }} · Ergebnis melden
              </div>
            </div>
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0 text-[color:var(--warning)]"
            >
              {{ statusLabel[c.status] }}
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition ml-1" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- HISTORIE -->
    <section v-if="history.length > 0" class="anim anim-5 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Historie · {{ history.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="c in history" :key="c.id">
          <NuxtLink :to="`/challenges/${c.id}`" class="list-row group">
            <span class="lead-icon lead-icon--challenge shrink-0 opacity-60">
              <UIcon name="i-lucide-swords" class="size-[18px]" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] text-muted group-hover:text-primary transition-colors">
                vs {{ memberName(otherParty(c)) }}
              </div>
              <div class="text-xs text-dimmed truncate mt-0.5">
                {{ c.rankingName }} · {{ historyDate(c) }}
              </div>
            </div>
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
              :class="{
                'text-[color:var(--success)]': statusTone[c.status] === 'success',
                'text-[color:var(--warning)]': statusTone[c.status] === 'warning',
                'text-[color:var(--danger)]': statusTone[c.status] === 'danger',
                'text-muted': statusTone[c.status] === 'neutral',
                'text-dimmed': statusTone[c.status] === 'dimmed',
              }"
            >
              {{ statusLabel[c.status] }}
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition ml-1" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- EMPTY -->
    <div v-if="totalCount === 0" class="anim anim-2 mt-16 text-center">
      <p class="text-base text-muted mb-4">
        Noch keine Forderungen.
      </p>
      <UButton
        to="/ranglisten"
        size="md"
        color="primary"
        icon="i-lucide-swords"
        class="rounded-full"
      >
        Spieler fordern
      </UButton>
    </div>
  </UContainer>
</template>
