<script setup lang="ts">
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
</script>

<template>
  <UContainer class="py-10 max-w-2xl">
    <!-- HERO -->
    <section class="mb-10">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-tight">
        Hallo<span v-if="profile">, {{ profile.firstName }}</span>.
      </h1>
      <p class="text-base text-muted mt-2">
        Bereit für ein Match?
      </p>
    </section>

    <!-- STAT STRIP -->
    <section
      v-if="profile"
      class="mb-12 grid grid-cols-3 gap-3 sm:gap-8 border-y border-default py-5"
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

    <!-- SUGGESTIONS -->
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

    <!-- QUICK NAV -->
    <section class="mb-12">
      <h2 class="text-sm font-semibold tracking-wide text-muted mb-4">
        Schnellzugriff
      </h2>
      <div class="grid grid-cols-3 gap-3">
        <NuxtLink
          to="/ranglisten"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-target" class="size-6 text-primary" />
          <span class="text-sm font-medium">Ranglisten</span>
        </NuxtLink>
        <NuxtLink
          to="/challenges"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-swords" class="size-6 text-primary" />
          <span class="text-sm font-medium">Forderungen</span>
        </NuxtLink>
        <NuxtLink
          to="/friendlies"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default bg-default transition-colors hover:border-primary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-handshake" class="size-6 text-primary" />
          <span class="text-sm font-medium">Freundschaftsspiele</span>
        </NuxtLink>
        <NuxtLink
          v-if="isStaff"
          to="/trainer"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default bg-default transition-colors hover:border-secondary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-clipboard-list" class="size-6 text-secondary" />
          <span class="text-sm font-medium">Trainer-Bereich</span>
        </NuxtLink>
        <NuxtLink
          v-if="isAdmin"
          to="/admin"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default bg-default transition-colors hover:border-secondary hover:bg-elevated/30"
        >
          <UIcon name="i-lucide-shield" class="size-6 text-secondary" />
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
