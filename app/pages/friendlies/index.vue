<script setup lang="ts">
import type { FriendlyDetailDto, FriendlyStatus } from '~~/server/modules/friendlies'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Freundschaftsspiele' })

const { user } = useUserSession()
const { name: memberName } = await useMemberLookup()
const { data: friendlies } = await useFetch<FriendlyDetailDto[]>('/api/friendlies', {
  default: () => [],
})

const me = computed(() => user.value?.memberId)

const incoming = computed(() =>
  (friendlies.value ?? []).filter(
    (f) =>
      f.status === 'PROPOSED'
      && f.invitees.some((i) => i.memberId === me.value && i.status === 'pending'),
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

const totalCount = computed(
  () =>
    incoming.value.length
    + outgoingPending.value.length
    + upcoming.value.length
    + past.value.length,
)

const statusLabel: Record<FriendlyStatus, string> = {
  PROPOSED: 'Offen',
  CONFIRMED: 'Bestätigt',
  DECLINED: 'Abgelehnt',
  CANCELLED: 'Abgesagt',
  PLAYED: 'Ergebnis fehlt',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
}

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'dimmed'
const statusTone: Record<FriendlyStatus, StatusTone> = {
  PROPOSED: 'neutral',
  CONFIRMED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'dimmed',
  PLAYED: 'warning',
  COMPLETED: 'success',
  DISPUTED: 'warning',
}

function inviteeSummary(f: FriendlyDetailDto): string {
  const total = f.invitees.length
  const accepted = f.invitees.filter((i) => i.status === 'accepted').length
  return `${accepted}/${total} angenommen`
}

function opponents(f: FriendlyDetailDto): string {
  const myId = me.value
  if (!myId) return f.invitees.map((i) => memberName(i.memberId)).join(', ')
  if (f.initiatorId === myId) {
    return f.invitees.map((i) => memberName(i.memberId)).join(', ')
  }
  return memberName(f.initiatorId)
}

const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function dateChip(d: Date | string): { dm: string; time: string } {
  const date = new Date(d)
  return { dm: dayMonthFmt.format(date), time: timeFmt.format(date) }
}

function pastDate(d: Date | string): string {
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
    <header class="anim anim-1 mb-10 md:mb-12 flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
          Freundschaftsspiele
        </h1>
        <p v-if="totalCount > 0" class="text-sm text-muted mt-2">
          {{ totalCount }} {{ totalCount === 1 ? 'Spiel' : 'Spiele' }} insgesamt.
        </p>
      </div>
      <UButton to="/friendlies/new" color="primary" icon="i-lucide-plus" class="rounded-full">
        Anbieten
      </UButton>
    </header>

    <!-- EINGEHEND -->
    <section v-if="incoming.length > 0" class="anim anim-2 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Eingehend · {{ incoming.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="f in incoming" :key="f.id">
          <NuxtLink :to="`/friendlies/${f.id}`" class="list-row group">
            <span class="date-chip font-mono shrink-0">
              <span class="text-xs font-semibold tabular-nums leading-none">
                {{ dateChip(f.scheduledAt).dm }}
              </span>
              <span class="text-[10px] text-dimmed tabular-nums leading-none mt-1">
                {{ dateChip(f.scheduledAt).time }}
              </span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ memberName(f.initiatorId) }} lädt dich ein
              </div>
              <div class="text-xs text-muted truncate mt-0.5 inline-flex items-center gap-1.5">
                <span class="badge-new" aria-label="Neu">
                  <span class="badge-new__dot" aria-hidden="true" />
                  Neu
                </span>
                <span class="dot-sep" aria-hidden="true" />
                <span class="truncate">
                  {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }}<template v-if="f.courtInfo"> · {{ f.courtInfo }}</template>
                </span>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- AUSGEHEND -->
    <section v-if="outgoingPending.length > 0" class="anim anim-3 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Ausgehend · {{ outgoingPending.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="f in outgoingPending" :key="f.id">
          <NuxtLink :to="`/friendlies/${f.id}`" class="list-row group">
            <span class="date-chip font-mono shrink-0">
              <span class="text-xs font-semibold tabular-nums leading-none">
                {{ dateChip(f.scheduledAt).dm }}
              </span>
              <span class="text-[10px] text-dimmed tabular-nums leading-none mt-1">
                {{ dateChip(f.scheduledAt).time }}
              </span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }} · {{ opponents(f) }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ inviteeSummary(f) }}<template v-if="f.courtInfo"> · {{ f.courtInfo }}</template>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- BESTÄTIGT -->
    <section v-if="upcoming.length > 0" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Bestätigt · {{ upcoming.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="f in upcoming" :key="f.id">
          <NuxtLink :to="`/friendlies/${f.id}`" class="list-row group">
            <span class="date-chip font-mono shrink-0">
              <span class="text-xs font-semibold tabular-nums leading-none">
                {{ dateChip(f.scheduledAt).dm }}
              </span>
              <span class="text-[10px] text-dimmed tabular-nums leading-none mt-1">
                {{ dateChip(f.scheduledAt).time }}
              </span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }} · {{ opponents(f) }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                <template v-if="f.courtInfo">{{ f.courtInfo }} · </template>{{ statusLabel[f.status] }}
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- HISTORIE -->
    <section v-if="past.length > 0" class="anim anim-5 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Historie · {{ past.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="f in past" :key="f.id">
          <NuxtLink :to="`/friendlies/${f.id}`" class="list-row group">
            <span class="lead-icon lead-icon--friendly shrink-0 opacity-60">
              <UIcon name="i-lucide-handshake" class="size-[18px]" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] text-muted group-hover:text-primary transition-colors">
                {{ f.format === 'singles' ? 'Einzel' : 'Doppel' }} · {{ opponents(f) }}
              </div>
              <div class="text-xs text-dimmed truncate mt-0.5">
                {{ pastDate(f.scheduledAt) }}
              </div>
            </div>
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
              :class="{
                'text-[color:var(--success)]': statusTone[f.status] === 'success',
                'text-[color:var(--warning)]': statusTone[f.status] === 'warning',
                'text-[color:var(--danger)]': statusTone[f.status] === 'danger',
                'text-muted': statusTone[f.status] === 'neutral',
                'text-dimmed': statusTone[f.status] === 'dimmed',
              }"
            >
              {{ statusLabel[f.status] }}
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition ml-1" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- EMPTY -->
    <div v-if="totalCount === 0" class="anim anim-2 mt-16 text-center">
      <p class="text-base text-muted mb-4">
        Noch keine Freundschaftsspiele.
      </p>
      <UButton
        to="/friendlies/new"
        size="md"
        color="primary"
        icon="i-lucide-handshake"
        class="rounded-full"
      >
        Spiel anbieten
      </UButton>
    </div>
  </UContainer>
</template>
