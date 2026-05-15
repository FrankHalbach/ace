<script setup lang="ts">
import type { FriendlyDetailDto, FriendlyStatus } from '~~/server/modules/friendlies'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Freundschaftsspiele' })

const { user } = useUserSession()
const { data: friendlies } = await useFetch<FriendlyDetailDto[]>('/api/friendlies', {
  default: () => [],
})

const me = computed(() => user.value?.memberId)

function inviteeStatus(f: FriendlyDetailDto): {
  total: number
  accepted: number
  declined: number
  pending: number
} {
  const total = f.invitees.length
  const accepted = f.invitees.filter((i) => i.status === 'accepted').length
  const declined = f.invitees.filter((i) => i.status === 'declined').length
  const pending = f.invitees.filter((i) => i.status === 'pending').length
  return { total, accepted, declined, pending }
}

const incoming = computed(() =>
  (friendlies.value ?? []).filter(
    (f) =>
      f.status === 'PROPOSED' &&
      f.invitees.some((i) => i.memberId === me.value && i.status === 'pending'),
  ),
)
const outgoingPending = computed(() =>
  (friendlies.value ?? []).filter(
    (f) => f.status === 'PROPOSED' && f.initiatorId === me.value,
  ),
)
const upcoming = computed(() =>
  (friendlies.value ?? []).filter((f) => f.status === 'CONFIRMED'),
)
const past = computed(() =>
  (friendlies.value ?? []).filter((f) =>
    ['COMPLETED', 'PLAYED', 'DECLINED', 'CANCELLED', 'DISPUTED'].includes(f.status),
  ),
)

const statusLabel: Record<FriendlyStatus, string> = {
  PROPOSED: 'Offen',
  CONFIRMED: 'Bestätigt',
  DECLINED: 'Abgelehnt',
  CANCELLED: 'Abgesagt',
  PLAYED: 'Gespielt',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
}

const statusColor: Record<FriendlyStatus, string> = {
  PROPOSED: 'bg-stone-200 text-stone-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-stone-100 text-stone-500',
  PLAYED: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  DISPUTED: 'bg-amber-100 text-amber-800',
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">Freundschaftsspiele</h1>
      <UButton color="primary" to="/friendlies/new">+ Anbieten</UButton>
    </header>

    <section v-if="incoming.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">📥 Eingehend ({{ incoming.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="f in incoming"
          :key="f.id"
          :to="`/friendlies/${f.id}`"
          class="block p-3 border border-stone-200 rounded-lg hover:border-emerald-600 transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">
                Mitglied #{{ f.initiatorId }} lädt dich ein —
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }}
              </div>
              <div class="text-xs text-stone-500">
                {{ formatDate(f.scheduledAt) }}<span v-if="f.courtInfo"> · {{ f.courtInfo }}</span>
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[f.status]">
              {{ statusLabel[f.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="outgoingPending.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">📤 Ausgehend ({{ outgoingPending.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="f in outgoingPending"
          :key="f.id"
          :to="`/friendlies/${f.id}`"
          class="block p-3 border border-stone-200 rounded-lg hover:border-emerald-600 transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }} —
                {{ inviteeStatus(f).accepted }}/{{ inviteeStatus(f).total }} angenommen
              </div>
              <div class="text-xs text-stone-500">
                {{ formatDate(f.scheduledAt) }}<span v-if="f.courtInfo"> · {{ f.courtInfo }}</span>
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[f.status]">
              {{ statusLabel[f.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="upcoming.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">🎾 Bestätigt ({{ upcoming.length }})</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="f in upcoming"
          :key="f.id"
          :to="`/friendlies/${f.id}`"
          class="block p-3 border border-stone-200 rounded-lg hover:border-emerald-600 transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }}
              </div>
              <div class="text-xs text-stone-500">
                {{ formatDate(f.scheduledAt) }}<span v-if="f.courtInfo"> · {{ f.courtInfo }}</span>
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[f.status]">
              {{ statusLabel[f.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section v-if="past.length > 0">
      <h2 class="text-lg font-semibold mb-3">Vergangen</h2>
      <div class="space-y-2">
        <NuxtLink
          v-for="f in past"
          :key="f.id"
          :to="`/friendlies/${f.id}`"
          class="block p-3 border border-stone-200 rounded-lg hover:border-stone-400 transition opacity-75"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }}
              </div>
              <div class="text-xs text-stone-500">
                {{ formatDate(f.scheduledAt) }}
              </div>
            </div>
            <span class="inline-block px-2 py-0.5 rounded-full text-xs font-mono" :class="statusColor[f.status]">
              {{ statusLabel[f.status] }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <p
      v-if="incoming.length === 0 && outgoingPending.length === 0 && upcoming.length === 0 && past.length === 0"
      class="text-stone-500 italic"
    >
      Du hast noch keine Freundschaftsspiele.
      <NuxtLink to="/friendlies/new" class="text-emerald-700 underline">Lade jemanden ein →</NuxtLink>
    </p>
  </UContainer>
</template>
