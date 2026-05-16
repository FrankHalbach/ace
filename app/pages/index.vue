<script setup lang="ts">
import type { ChallengeDto } from '~~/server/modules/challenges'
import type { FriendlyDetailDto } from '~~/server/modules/friendlies'
import type { PlayerProfileDto } from '~~/server/modules/members'
import type { SuggestionDto, SuggestionReason } from '~~/server/modules/suggestions'

const { loggedIn, user } = useUserSession()
const toast = useToast()

const { data: profile } = await useFetch<PlayerProfileDto>(
  () => `/api/members/${user.value?.memberId}/profile`,
  { immediate: loggedIn.value && !!user.value?.memberId, watch: [user] },
)

const { data: suggestions, refresh: refreshSuggestions } = await useFetch<SuggestionDto[]>(
  '/api/suggestions',
  { immediate: loggedIn.value, default: () => [] },
)

const { data: challenges } = await useFetch<ChallengeDto[]>('/api/challenges', {
  immediate: loggedIn.value,
  default: () => [],
})

const { data: friendlies } = await useFetch<FriendlyDetailDto[]>('/api/friendlies', {
  immediate: loggedIn.value,
  default: () => [],
})

const { name: memberName } = await useMemberLookup()

useHead({ title: 'Start' })

definePageMeta({
  middleware: 'auth',
})

const reasonIcon: Record<SuggestionReason, string> = {
  'inactive-partner': 'i-lucide-clock-3',
  'new-pairing': 'i-lucide-sparkles',
  'similar-strength': 'i-lucide-scale',
}

const challenging = ref<number | null>(null)

async function sendChallenge(s: SuggestionDto) {
  if (s.rankingId === null) return
  challenging.value = s.memberId
  try {
    await $fetch('/api/challenges', {
      method: 'POST',
      body: { challengedId: s.memberId, rankingId: s.rankingId },
    })
    toast.add({ title: `Forderung an ${s.firstName} versendet`, color: 'primary' })
    await refreshSuggestions()
  } catch (err: unknown) {
    toast.add({
      title: 'Forderung fehlgeschlagen',
      description: (err as { statusMessage?: string }).statusMessage ?? '',
      color: 'error',
    })
  } finally {
    challenging.value = null
  }
}

type RankingStanding = PlayerProfileDto['rankings'][number]

const topRanking = computed<RankingStanding | null>(() => {
  const r = profile.value?.rankings ?? []
  if (r.length === 0) return null
  return r.slice().sort((a: RankingStanding, b: RankingStanding) => a.position - b.position)[0] ?? null
})

// Rollen aus der Session: Trainer-/Admin-Karten erscheinen nur, wenn die
// jeweilige Rolle gesetzt ist. user.value ist nach loggedIn-Check non-null.
const isStaff = computed(() => {
  const roles = user.value?.roles ?? []
  return roles.includes('trainer') || roles.includes('admin')
})
const isAdmin = computed(() => user.value?.roles?.includes('admin') ?? false)

// Heute-Datum für den Masthead-Datestamp (Desktop). Wird einmalig beim
// Page-Load berechnet — keine Reaktivität nötig.
const today = new Date()
const todayWeekday = today.toLocaleDateString('de-DE', { weekday: 'long' })
const todayLong = today
  .toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  .toUpperCase()

// ---- Offen / Geplant -------------------------------------------------------
// Landing-Block zeigt einen kompakten Überblick über das, was läuft:
//   - "Offen"   = braucht meine Aktion (eingehende Forderungen, Friendly-
//                 Einladungen) und beschleunigte Forderungen ohne Termin.
//   - "Geplant" = bestätigte Friendlies mit zukünftigem scheduledAt.
// Forderungen haben in v1 kein scheduledAt (Termin läuft telefonisch) —
// daher landen sie bis zur Ergebnis-Meldung in "Offen".

type OpenItem = {
  key: string
  kind: 'forderung' | 'friendly'
  to: string
  primary: string
  meta: string
  sort: number  // niedriger = wichtiger
}

type ScheduledItem = {
  key: string
  to: string
  primary: string
  scheduledAt: Date
  courtInfo: string | null
}

const me = computed(() => user.value?.memberId ?? null)

function isMineFriendly(f: FriendlyDetailDto): boolean {
  const myId = me.value
  if (myId === null) return false
  return f.initiatorId === myId || f.invitees.some((i) => i.memberId === myId)
}

function inviteePendingForMe(f: FriendlyDetailDto): boolean {
  const myId = me.value
  if (myId === null) return false
  return f.invitees.some((i) => i.memberId === myId && i.status === 'pending')
}

function relativeDe(d: string | Date): string {
  const date = new Date(d)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function formatTermin(d: string | Date): string {
  return new Date(d).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const openItems = computed<OpenItem[]>(() => {
  const myId = me.value
  if (myId === null) return []
  const list: OpenItem[] = []

  for (const c of challenges.value ?? []) {
    if (c.status === 'PROPOSED' && c.challengedId === myId) {
      list.push({
        key: `c-in-${c.id}`,
        kind: 'forderung',
        to: `/challenges/${c.id}`,
        primary: `${memberName(c.challengerId)} fordert dich`,
        meta: `Forderung · ${relativeDe(c.createdAt)}`,
        sort: 0,
      })
    }
  }

  for (const f of friendlies.value ?? []) {
    if (f.status === 'PROPOSED' && inviteePendingForMe(f)) {
      list.push({
        key: `f-in-${f.id}`,
        kind: 'friendly',
        to: `/friendlies/${f.id}`,
        primary: `${memberName(f.initiatorId)} lädt dich ein`,
        meta: `Freundschaftsspiel · ${formatTermin(f.scheduledAt)}`,
        sort: 1,
      })
    }
  }

  for (const c of challenges.value ?? []) {
    if (
      c.status === 'ACCEPTED'
      && (c.challengerId === myId || c.challengedId === myId)
    ) {
      const other = c.challengerId === myId ? c.challengedId : c.challengerId
      list.push({
        key: `c-act-${c.id}`,
        kind: 'forderung',
        to: `/challenges/${c.id}`,
        primary: `vs ${memberName(other)} — Ergebnis melden`,
        meta: 'Forderung · angenommen',
        sort: 2,
      })
    }
  }

  return list.sort((a, b) => a.sort - b.sort).slice(0, 5)
})

const scheduledItems = computed<ScheduledItem[]>(() => {
  const now = Date.now()
  const list: ScheduledItem[] = []
  for (const f of friendlies.value ?? []) {
    if (f.status !== 'CONFIRMED') continue
    if (!isMineFriendly(f)) continue
    const dt = new Date(f.scheduledAt)
    if (dt.getTime() < now) continue
    const opponent = f.invitees.find((i) => i.memberId !== me.value)
    list.push({
      key: `f-conf-${f.id}`,
      to: `/friendlies/${f.id}`,
      primary: opponent
        ? `${f.format === 'singles' ? 'Einzel' : 'Doppel'} gegen ${memberName(opponent.memberId)}`
        : f.format === 'singles' ? 'Einzel-Match' : 'Doppel-Match',
      scheduledAt: dt,
      courtInfo: f.courtInfo ?? null,
    })
  }
  return list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 5)
})
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-4xl md:py-14">
    <!-- HERO mit Masthead-Datestamp (Desktop) -->
    <section class="mb-10 md:mb-12 md:flex md:items-end md:justify-between md:gap-8">
      <div class="md:flex-1">
        <h1 class="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          Hallo<span v-if="profile">, {{ profile.firstName }}</span>.
        </h1>
        <p class="text-base text-muted mt-2">
          Bereit für ein Match?
        </p>
      </div>
      <div class="hidden md:flex md:flex-col md:items-end md:text-right md:shrink-0">
        <span class="mono text-[10px] uppercase tracking-[0.22em] text-muted leading-none">
          {{ todayWeekday }}
        </span>
        <span class="mono text-sm font-semibold tabular-nums tracking-wider text-primary leading-none mt-2">
          {{ todayLong }}
        </span>
      </div>
    </section>

    <!-- STAT STRIP -->
    <section
      v-if="profile"
      class="mb-12 grid grid-cols-3 gap-3 sm:gap-8 md:gap-16 border-y border-default py-5 md:py-6"
    >
      <div class="min-w-0">
        <p class="text-xs text-muted font-medium tracking-wide mb-1">Deine LK</p>
        <p class="text-2xl font-semibold font-mono tabular-nums text-primary leading-none">
          {{ profile.dtbLk.toFixed(1) }}
        </p>
      </div>
      <div class="min-w-0 sm:border-l sm:border-default sm:pl-8">
        <p class="text-xs text-muted font-medium tracking-wide mb-1">Position</p>
        <p v-if="topRanking" class="text-2xl font-semibold font-mono tabular-nums leading-none">
          <span class="text-base text-muted font-normal">#</span>{{ topRanking.position }}
        </p>
        <p v-else class="text-2xl font-semibold text-dimmed leading-none">—</p>
        <p v-if="topRanking" class="text-xs text-muted truncate mt-1.5">
          {{ topRanking.ageGroupName }}
        </p>
        <p v-else class="text-xs text-muted truncate mt-1.5">
          keine Rangliste
        </p>
      </div>
      <div class="min-w-0 sm:border-l sm:border-default sm:pl-8">
        <p class="text-xs text-muted font-medium tracking-wide mb-1">Spiele</p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ profile.matchesLast4Weeks }}
        </p>
        <p class="text-xs text-muted truncate mt-1.5">letzte 4 Wo</p>
      </div>
    </section>

    <!-- Offen — volle Container-Breite, konsistent mit Schnellzugriff. -->
    <section v-if="openItems.length > 0" class="mb-12">
      <h2 class="text-sm font-semibold tracking-wide text-muted mb-2">
        Offen
      </h2>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="item in openItems" :key="item.key">
          <NuxtLink :to="item.to" class="group flex items-center gap-3 py-2.5">
            <UIcon
              :name="item.kind === 'forderung' ? 'i-lucide-swords' : 'i-lucide-handshake'"
              class="size-4 text-secondary shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {{ item.primary }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ item.meta }}
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- Geplant — gleiche Behandlung wie Offen und Suggestions. -->
    <section v-if="scheduledItems.length > 0" class="mb-12">
      <h2 class="text-sm font-semibold tracking-wide text-muted mb-2">
        Geplant
      </h2>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="item in scheduledItems" :key="item.key">
          <NuxtLink :to="item.to" class="group flex items-center gap-3 py-2.5">
            <div class="shrink-0 flex flex-col items-center justify-center min-w-[44px] py-0.5">
              <span class="mono text-[10px] uppercase tracking-[0.14em] text-muted leading-none">
                {{ item.scheduledAt.toLocaleDateString('de-DE', { weekday: 'short' }) }}
              </span>
              <span class="mono text-sm font-semibold tabular-nums text-primary leading-none mt-1">
                {{ item.scheduledAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {{ item.primary }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ item.scheduledAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr<span v-if="item.courtInfo"> · {{ item.courtInfo }}</span>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- SUGGESTIONS — volle Container-Breite. -->
    <section v-if="suggestions.length > 0" class="mb-12">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="text-sm font-semibold tracking-wide text-muted">
          Für dich vorgeschlagen
        </h2>
        <NuxtLink
          to="/ranglisten"
          class="text-xs text-muted hover:text-primary inline-flex items-center gap-1 transition-colors"
        >
          Mehr Spieler
          <UIcon name="i-lucide-arrow-right" class="size-3.5" />
        </NuxtLink>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li
          v-for="s in suggestions"
          :key="s.memberId"
          class="py-2.5 flex items-center justify-between gap-3 flex-wrap"
        >
          <NuxtLink :to="`/spieler/${s.memberId}`" class="group flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold group-hover:text-primary transition-colors">
                {{ s.firstName }} {{ s.lastName }}
              </span>
              <span
                class="text-[11px] font-mono tabular-nums text-muted ring-1 ring-default rounded px-1.5 py-0.5"
              >
                LK {{ s.dtbLk.toFixed(1) }}
              </span>
            </div>
            <div class="flex items-center gap-1 mt-0.5 text-xs text-muted min-w-0">
              <UIcon :name="reasonIcon[s.reason]" class="size-3.5 shrink-0" />
              <span class="truncate">{{ s.reasonText }}</span>
            </div>
          </NuxtLink>
          <div class="flex gap-1.5 shrink-0">
            <UButton
              v-if="s.rankingId !== null"
              size="xs"
              color="primary"
              icon="i-lucide-swords"
              :loading="challenging === s.memberId"
              @click="sendChallenge(s)"
            >
              Fordern
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="secondary"
              icon="i-lucide-handshake"
              :to="`/friendlies/new?opponentId=${s.memberId}`"
            >
              Friendly
            </UButton>
          </div>
        </li>
      </ul>
    </section>

    <!-- SCHNELLZUGRIFF: volle Breite, auto-fit-Grid passt sich an Rollen-
         Anzahl an. 3 Tiles (Mitglied), 4 (Trainer), 5 (Admin) füllen die
         Reihe ohne leere Zellen oder Orphan-Karten. -->
    <section class="mb-12">
      <h2 class="text-sm font-semibold tracking-wide text-muted mb-4">
        Schnellzugriff
      </h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <NuxtLink
          to="/ranglisten"
          class="flex flex-col items-center gap-2 p-4 md:p-5 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-target" class="size-6 md:size-7 text-primary" />
          <span class="text-sm font-medium">Ranglisten</span>
        </NuxtLink>
        <NuxtLink
          to="/challenges"
          class="flex flex-col items-center gap-2 p-4 md:p-5 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-swords" class="size-6 md:size-7 text-primary" />
          <span class="text-sm font-medium">Forderungen</span>
        </NuxtLink>
        <NuxtLink
          to="/friendlies"
          class="flex flex-col items-center gap-2 p-4 md:p-5 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-handshake" class="size-6 md:size-7 text-primary" />
          <span class="text-sm font-medium">Freundschaftsspiele</span>
        </NuxtLink>
        <NuxtLink
          v-if="isStaff"
          to="/trainer"
          class="flex flex-col items-center gap-2 p-4 md:p-5 rounded-lg border border-default bg-default transition-colors hover:border-secondary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-clipboard-list" class="size-6 md:size-7 text-secondary" />
          <span class="text-sm font-medium">Trainer-Bereich</span>
        </NuxtLink>
        <NuxtLink
          v-if="isAdmin"
          to="/admin"
          class="flex flex-col items-center gap-2 p-4 md:p-5 rounded-lg border border-default bg-default transition-colors hover:border-secondary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-shield" class="size-6 md:size-7 text-secondary" />
          <span class="text-sm font-medium">Admin-Bereich</span>
        </NuxtLink>
      </div>
    </section>

    <!-- FOOTER NOTE -->
    <p class="text-xs text-dimmed mt-16 text-center">
      In Entwicklung · Profilfoto · E-Mail-Versand der Match-Vorschläge · Trainingsgruppen
    </p>
  </UContainer>
</template>
