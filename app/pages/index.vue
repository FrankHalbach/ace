<script setup lang="ts">
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

// Termine-Daten (challenges, friendlies, scheduledItems) + Member-Name-
// Lookup teilen wir uns mit dem Layout-Right-Rail via useTermine — Nuxt-
// Cache dedupliziert auf dem useFetch-Key. memberName wird hier mit-
// exportiert, damit wir nicht erneut useMemberLookup awaiten müssen (jeder
// User-Composable-Await danach würde den Nuxt-Context verlieren).
// nextMatch + upcomingRest brauchen wir auch hier — der Layout-Rail zeigt
// Termine nur ab xl, drunter rendert die Home-Page sie selbst inline.
const {
  challenges,
  friendlies,
  scheduledItems,
  nextMatch,
  upcomingRest,
  memberName,
} = await useTermine()

useHead({ title: 'Start' })

definePageMeta({
  middleware: 'auth',
})

const reasonIcon: Record<SuggestionReason, string> = {
  'inactive-partner': 'i-lucide-clock-3',
  'new-pairing': 'i-lucide-sparkles',
  'similar-strength': 'i-lucide-scale',
}

const challenging = ref<string | null>(null)

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
      description: apiError(err),
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

// Trainer-/Admin-Bereich liegen jetzt in der Desktop-Header-Nav
// (layouts/default.vue), nicht mehr als Schnellzugriffs-Karten auf der
// Startseite — daher fallen die Rollen-Computeds hier weg.

// Heute-Datum für den Masthead-Datestamp (Desktop). Wird einmalig beim
// Page-Load berechnet — keine Reaktivität nötig.
const today = new Date()
const todayWeekday = today.toLocaleDateString('de-DE', { weekday: 'long' })
const todayLong = today
  .toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  .toUpperCase()

// ---- Offen-Liste -----------------------------------------------------------
// "Offen" = braucht meine Aktion (eingehende Forderungen + Friendly-Einla-
// dungen + angenommene Forderungen, deren Ergebnis ich melden muss).
// Termine ("Geplant" + "Als nächstes") laufen über useTermine und werden
// vom Layout-Right-Rail gerendert (auf allen Pages ab xl, nicht mehr nur
// auf Home).

type OpenItem = {
  key: string
  kind: 'forderung' | 'friendly'
  to: string
  primary: string
  meta: string
  sort: number  // niedriger = wichtiger
  /** Eingehender Pending-Item — bekommt den "Neu"-Punkt. */
  isNew: boolean
}

const me = computed(() => user.value?.memberId ?? null)

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
        isNew: true,
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
        isNew: true,
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
        isNew: false,
      })
    }
  }

  return list.sort((a, b) => a.sort - b.sort).slice(0, 5)
})

// Hero-Untertitel passt sich der Tagesform an: leer / 1 Sache / N Sachen.
// scheduledItems kommt aus useTermine().
const heroSub = computed(() => {
  const n = openItems.value.length
  if (n === 0 && scheduledItems.value.length === 0) return 'Lust auf ein Match?'
  if (n === 0) return 'Nichts zu tun — bereit fürs nächste Match?'
  if (n === 1) return 'Eine Sache wartet auf dich.'
  return `${n} Sachen warten auf dich.`
})
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-4xl md:py-14">
    <!-- HERO — editorial greeting + Masthead-Datestamp (Desktop). Termine
         wandern auf xl in den rechten Layout-Drawer via Teleport (siehe
         unten), drunter rendern sie inline an ihrer DOM-Position. -->
    <section class="anim anim-1 mb-10 md:mb-14 md:flex md:items-end md:justify-between md:gap-10">
      <div class="md:flex-1">
        <h1 class="text-4xl md:text-6xl font-semibold tracking-[-0.025em] leading-[1.05]">
          Hallo<template v-if="profile">, <em class="italic font-medium text-primary">{{ profile.firstName }}</em></template>.
        </h1>
        <p class="text-base md:text-lg text-muted mt-3">
          {{ heroSub }}
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

    <!-- QUICK-ACTIONS — fixt die Friendly-Discoverability. Forderung führt
         in die Rangliste (dort wählt der User einen Gegner), Friendly direkt
         ins Form. -->
    <section class="anim anim-2 mb-10 md:mb-12 flex flex-wrap gap-2.5">
      <UButton
        to="/ranglisten"
        size="md"
        color="primary"
        icon="i-lucide-swords"
        class="rounded-full"
      >
        Neue Forderung
      </UButton>
      <UButton
        to="/friendlies/new"
        size="md"
        variant="soft"
        color="secondary"
        icon="i-lucide-handshake"
        class="rounded-full"
      >
        Freundschaftsspiel planen
      </UButton>
    </section>

    <!-- STAT STRIP — scoreboard-Style mit vertikalen Hairlines, größerer
         Mono-Typografie und hauchdünnem Sub-Hint. -->
    <section
      v-if="profile"
      class="anim anim-2 stats mb-12 md:mb-14 grid grid-cols-3 border-y border-default py-5 md:py-7"
      aria-label="Deine Saison-Zahlen"
    >
      <div class="stat min-w-0 px-3 md:px-7">
        <p class="mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted leading-none mb-2">
          Deine LK
        </p>
        <p class="mono text-3xl md:text-[2.5rem] font-semibold tabular-nums text-primary leading-none tracking-[-0.02em]">
          {{ profile.dtbLk.toFixed(1) }}
        </p>
      </div>
      <div class="stat min-w-0 px-3 md:px-7">
        <p class="mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted leading-none mb-2">
          Position
        </p>
        <p v-if="topRanking" class="mono text-3xl md:text-[2.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em]">
          <span class="text-xl md:text-2xl text-dimmed font-normal">#</span>{{ topRanking.position }}
        </p>
        <p v-else class="mono text-3xl md:text-[2.5rem] font-semibold text-dimmed leading-none">—</p>
        <p v-if="topRanking" class="text-xs text-muted truncate mt-2.5">
          {{ topRanking.ageGroupName }}
        </p>
        <p v-else class="text-xs text-muted truncate mt-2.5">
          keine Rangliste
        </p>
      </div>
      <div class="stat min-w-0 px-3 md:px-7">
        <p class="mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted leading-none mb-2">
          Spiele
        </p>
        <p class="mono text-3xl md:text-[2.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em]">
          {{ profile.matchesLast4Weeks }}
        </p>
        <p class="text-xs text-muted truncate mt-2.5">letzte 4 Wo</p>
      </div>
    </section>

    <!-- TERMINE inline für Mobile (< xl) — ab xl rendert der Layout-Right-
         Rail dieselben Sections, also hier ausblenden um Doppelung zu
         vermeiden. Damit sehen Mobile-User trotzdem "was als nächstes
         läuft", auch wenn der Rail nicht sichtbar ist. -->
    <div v-if="nextMatch || upcomingRest.length > 0" class="anim anim-3 xl:hidden mb-14 md:mb-16">
      <TermineSections :next-match="nextMatch" :upcoming-rest="upcomingRest" />
    </div>

    <!-- OFFEN — actions waiting on me. Eingehende Items kriegen den
         Tennis-Ball-Gelb-"Neu"-Punkt; "Ergebnis melden" nicht. -->
    <section v-if="openItems.length > 0" class="anim anim-4 mb-14 md:mb-16">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Offen · {{ openItems.length }}</h2>
      </div>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="item in openItems" :key="item.key">
          <NuxtLink :to="item.to" class="list-row group">
            <span
              class="lead-icon shrink-0"
              :class="item.kind === 'forderung' ? 'lead-icon--challenge' : 'lead-icon--friendly'"
            >
              <UIcon
                :name="item.kind === 'forderung' ? 'i-lucide-swords' : 'i-lucide-handshake'"
                class="size-[18px]"
              />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                {{ item.primary }}
              </div>
              <div class="text-xs text-muted truncate mt-0.5 inline-flex items-center gap-1.5">
                <span v-if="item.isNew" class="badge-new" aria-label="Neu">
                  <span class="badge-new__dot" aria-hidden="true" />
                  Neu
                </span>
                <span v-if="item.isNew" class="dot-sep" aria-hidden="true" />
                <span class="truncate">{{ item.meta }}</span>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- SUGGESTIONS — Court-Line-Head plus dezente Avatar-Initialen. -->
    <section v-if="suggestions.length > 0" class="anim anim-5 mb-14 md:mb-16">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Für dich vorgeschlagen</h2>
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
          class="py-3 flex items-center justify-between gap-3 flex-wrap"
        >
          <NuxtLink :to="`/spieler/${s.memberId}`" class="group flex-1 min-w-0 inline-flex items-center gap-3">
            <UAvatar
              :alt="`${s.firstName} ${s.lastName}`"
              :text="`${s.firstName[0] ?? ''}${s.lastName[0] ?? ''}`.toUpperCase()"
              size="md"
              class="shrink-0 ring-1 ring-[color:var(--rule)] !bg-[color:var(--bg-soft)] !text-[color:var(--ink-muted)]"
            />
            <div class="min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="text-[15px] font-semibold tracking-[-0.005em] group-hover:text-primary transition-colors">
                  {{ s.firstName }} {{ s.lastName }}
                </span>
                <span
                  class="mono text-[10px] font-semibold tabular-nums text-muted ring-1 ring-default rounded px-1.5 py-0.5 tracking-wider"
                >
                  LK {{ s.dtbLk.toFixed(1) }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 mt-0.5 text-xs text-muted min-w-0">
                <UIcon :name="reasonIcon[s.reason]" class="size-3.5 shrink-0" />
                <span class="truncate">{{ s.reasonText }}</span>
              </div>
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

    <!-- FOOTER NOTE -->
    <p class="text-xs text-dimmed mt-16 text-center">
      In Entwicklung · Profilfoto · E-Mail-Versand der Match-Vorschläge · Trainingsgruppen
    </p>
  </UContainer>
</template>

