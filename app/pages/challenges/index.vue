<script setup lang="ts">
import type { ChallengeDto, ChallengeStatus } from '~~/server/modules/challenges'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Challenges' })

const { user } = useUserSession()
const { data: challenges, refresh } = await useFetch<ChallengeDto[]>('/api/challenges', {
  default: () => [],
})

const incoming = computed(() =>
  (challenges.value ?? []).filter(
    (c) => c.challengedId === user.value?.memberId && c.status === 'PROPOSED',
  ),
)
const outgoing = computed(() =>
  (challenges.value ?? []).filter(
    (c) => c.challengerId === user.value?.memberId && c.status === 'PROPOSED',
  ),
)
const active = computed(() =>
  (challenges.value ?? []).filter((c) => c.status === 'ACCEPTED'),
)
const history = computed(() =>
  (challenges.value ?? []).filter((c) =>
    ['COMPLETED', 'DECLINED', 'EXPIRED', 'DISPUTED'].includes(c.status),
  ),
)

const statusLabel: Record<ChallengeStatus, string> = {
  PROPOSED: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
}

const statusColor: Record<ChallengeStatus, string> = {
  PROPOSED: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
  ACCEPTED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  DECLINED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  EXPIRED: 'bg-stone-100 text-stone-500 dark:bg-stone-900 dark:text-stone-400',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  DISPUTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

function otherParty(c: ChallengeDto): number {
  return c.challengerId === user.value?.memberId ? c.challengedId : c.challengerId
}
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <h1 class="text-2xl font-semibold mb-6">Challenges</h1>

    <section v-if="incoming.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">📥 Eingehend ({{ incoming.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="c in incoming"
          :key="c.id"
          :to="`/challenges/${c.id}`"
          class="block p-3 border border-default rounded-lg hover:border-primary transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">Mitglied #{{ otherParty(c) }} fordert dich</div>
              <div class="text-xs text-muted">
                Rangliste #{{ c.rankingId }} · {{ new Date(c.createdAt).toLocaleDateString('de-DE') }}
              </div>
            </div>
            <span
              class="inline-block px-2 py-0.5 rounded-full text-xs font-mono"
              :class="statusColor[c.status]"
            >
              {{ statusLabel[c.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="outgoing.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">📤 Ausgehend ({{ outgoing.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="c in outgoing"
          :key="c.id"
          :to="`/challenges/${c.id}`"
          class="block p-3 border border-default rounded-lg hover:border-primary transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">Du forderst Mitglied #{{ otherParty(c) }}</div>
              <div class="text-xs text-muted">
                Rangliste #{{ c.rankingId }} · wartet auf Antwort
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[c.status]">
              {{ statusLabel[c.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="active.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">🎾 Aktive Matches ({{ active.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="c in active"
          :key="c.id"
          :to="`/challenges/${c.id}`"
          class="block p-3 border border-default rounded-lg hover:border-primary transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">vs Mitglied #{{ otherParty(c) }}</div>
              <div class="text-xs text-muted">
                Rangliste #{{ c.rankingId }} · spielen und Ergebnis melden
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[c.status]">
              {{ statusLabel[c.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="history.length > 0">
      <h2 class="text-lg font-semibold mb-3">Historie</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="c in history"
          :key="c.id"
          :to="`/challenges/${c.id}`"
          class="block p-3 border border-default rounded-lg hover:border-muted transition opacity-75"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">vs Mitglied #{{ otherParty(c) }}</div>
              <div class="text-xs text-muted">
                Rangliste #{{ c.rankingId }} ·
                {{ new Date(c.completedAt ?? c.declinedAt ?? c.expiredAt ?? c.createdAt).toLocaleDateString('de-DE') }}
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[c.status]">
              {{ statusLabel[c.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <p
      v-if="incoming.length === 0 && outgoing.length === 0 && active.length === 0 && history.length === 0"
      class="text-muted italic"
    >
      Du hast noch keine Challenges. Gehe zu einer Rangliste und fordere jemanden heraus.
    </p>
  </UContainer>
</template>
