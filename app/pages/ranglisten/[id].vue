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
    const status = (err as { statusCode?: number; statusMessage?: string })
    toast.add({
      title: 'Forderung fehlgeschlagen',
      description: status.statusMessage ?? 'Unbekannter Fehler',
      color: 'error',
    })
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
  <UContainer v-if="ranking" class="py-8 max-w-3xl">
    <!-- HEADER -->
    <header class="mb-8">
      <NuxtLink
        to="/ranglisten"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Ranglisten
      </NuxtLink>
      <div class="flex items-start justify-between gap-3 mt-2 flex-wrap">
        <div class="min-w-0">
          <h1 class="text-3xl font-semibold tracking-tight">
            {{ ranking.ageGroupName }}
          </h1>
          <p class="text-sm text-muted mt-1">
            {{ ranking.seasonName }}
          </p>
        </div>
        <span
          class="text-xs font-medium px-2 py-1 rounded ring-1 ring-default text-muted shrink-0"
        >
          {{ modeLabel[ranking.mode] }}
        </span>
      </div>
    </header>

    <!-- VIEWER STAT STRIP -->
    <section
      v-if="viewerEntry"
      class="mb-8 grid grid-cols-2 gap-6 border-y border-default py-5"
    >
      <div>
        <p class="text-xs text-muted font-medium tracking-wide mb-1">Deine Position</p>
        <p class="text-2xl font-semibold font-mono tabular-nums text-primary leading-none">
          <span class="text-base text-muted font-normal">#</span>{{ viewerEntry.display.primary }}
        </p>
      </div>
      <div v-if="viewerEntry.display.secondary" class="border-l border-default pl-6">
        <p class="text-xs text-muted font-medium tracking-wide mb-1">Punkte</p>
        <p class="text-2xl font-semibold font-mono tabular-nums leading-none">
          {{ viewerEntry.display.secondary }}
        </p>
      </div>
    </section>

    <!-- FILTER ROW + HINT -->
    <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <UCheckbox v-model="onlyActive" label="nur aktive Spieler" />
      <span class="text-xs text-dimmed tabular-nums">
        {{ ranking.entries.length }} Spieler
      </span>
    </div>

    <p v-if="user && !viewerEntry" class="mb-4 text-sm text-muted flex items-center gap-2">
      <UIcon name="i-lucide-info" class="size-4 shrink-0" />
      Du stehst nicht in dieser Rangliste — Forderungen sind hier nicht möglich.
    </p>

    <!-- ENTRY LIST -->
    <ul v-if="ranking.entries.length > 0" class="divide-y divide-default border-y border-default">
      <li
        v-for="e in ranking.entries"
        :key="e.id"
        class="py-3 flex items-center gap-3"
        :class="{ 'bg-primary/5 -mx-2 px-2 rounded': user && e.memberId === user.memberId }"
      >
        <div
          class="font-mono tabular-nums text-sm font-semibold min-w-[2.5rem] text-center px-1.5 py-1 rounded ring-1"
          :class="user && e.memberId === user.memberId
            ? 'ring-primary text-primary'
            : 'ring-default text-muted'"
        >
          {{ e.display.primary }}
        </div>
        <NuxtLink :to="`/spieler/${e.memberId}`" class="flex-1 min-w-0 group">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="font-medium group-hover:text-primary transition-colors">
              {{ e.member.firstName }} {{ e.member.lastName }}
            </span>
            <span
              class="text-[11px] font-mono tabular-nums text-muted ring-1 ring-default rounded px-1.5 py-0.5"
            >
              LK {{ e.member.dtbLk.toFixed(1) }}
            </span>
            <span v-if="e.member.status === 'pausiert'" class="text-xs text-dimmed">
              pausiert
            </span>
          </div>
        </NuxtLink>
        <div
          v-if="e.display.secondary"
          class="font-mono tabular-nums text-sm text-muted shrink-0"
        >
          {{ e.display.secondary }}
        </div>
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
      </li>
    </ul>

    <p v-else class="text-sm text-muted italic py-8 text-center">
      Noch keine Einträge in dieser Rangliste.
    </p>
  </UContainer>
</template>
