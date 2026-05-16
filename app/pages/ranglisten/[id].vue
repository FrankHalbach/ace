<script setup lang="ts">
import type { RankingDetailDto, RankingVariant } from '~~/server/modules/rankings'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => Number(route.params.id))

const onlyActive = ref(true)
const url = computed(() => `/api/rankings/${id.value}?onlyActive=${onlyActive.value}`)

const { data: ranking, refresh } = await useFetch<RankingDetailDto>(url, { watch: [url] })

const variantLabel: Record<RankingVariant, string> = {
  herren: 'Herren',
  damen: 'Damen',
  offen: 'Offen',
}

const modeLabel: Record<string, string> = {
  pyramid: 'Pyramide',
  elo: 'ELO',
  hybrid: 'Hybrid',
  'points-table': 'Punkte-Tabelle',
}

useHead({
  title: () =>
    ranking.value ? `${ranking.value.ageGroupName} · ${variantLabel[ranking.value.variant]}` : 'Rangliste',
})

const { user } = useUserSession()
const toast = useToast()
const challenging = ref<number | null>(null)

async function challenge(targetMemberId: number) {
  if (!ranking.value) return
  challenging.value = targetMemberId
  try {
    await $fetch('/api/challenges', {
      method: 'POST',
      body: { challengedId: targetMemberId, rankingId: ranking.value.id },
    })
    toast.add({ title: 'Challenge versendet', color: 'primary' })
    await refresh()
  } catch (err: unknown) {
    const status = (err as { statusCode?: number; statusMessage?: string })
    toast.add({
      title: 'Challenge fehlgeschlagen',
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

function canChallenge(targetMemberId: number, targetStatus: string): boolean {
  if (!user.value) return false
  if (!viewerEntry.value) return false
  if (user.value.memberId === targetMemberId) return false
  if (targetStatus === 'pausiert') return false
  return true
}
</script>

<template>
  <UContainer v-if="ranking" class="py-6 max-w-3xl">
    <header class="mb-6">
      <NuxtLink to="/ranglisten" class="text-sm text-muted hover:text-default">
        ← Alle Ranglisten
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">
        {{ ranking.ageGroupName }} · {{ variantLabel[ranking.variant] }}
      </h1>
      <div class="text-sm text-muted mt-1">
        {{ ranking.seasonName }} · {{ modeLabel[ranking.mode] }} · {{ ranking.entries.length }} Spieler
      </div>
    </header>

    <div class="mb-4">
      <UCheckbox v-model="onlyActive" label="nur aktive Spieler anzeigen" />
    </div>

    <p v-if="user && !viewerEntry" class="mb-4 text-sm text-muted">
      Du stehst nicht in dieser Rangliste — Forderungen sind hier nicht möglich.
    </p>

    <ul v-if="ranking.entries.length > 0" class="divide-y divide-default border border-default rounded-lg overflow-hidden">
      <li
        v-for="e in ranking.entries"
        :key="e.id"
        class="px-4 py-3 flex items-center justify-between gap-3"
      >
        <div class="flex items-baseline gap-3 flex-1">
          <div class="font-mono text-sm text-muted min-w-[60px]">{{ e.display.primary }}</div>
          <NuxtLink :to="`/spieler/${e.memberId}`" class="hover:text-primary transition">
            <div class="font-medium">
              {{ e.member.firstName }} {{ e.member.lastName }}
              <span v-if="user && e.memberId === user.memberId" class="ml-1 text-xs text-primary">(du)</span>
            </div>
            <div class="text-xs text-muted">
              LK {{ e.member.dtbLk.toFixed(1) }}
              <span v-if="e.member.status === 'pausiert'" class="text-dimmed">· pausiert</span>
            </div>
          </NuxtLink>
        </div>
        <div class="flex items-center gap-2">
          <div v-if="e.display.secondary" class="font-mono text-sm text-primary">
            {{ e.display.secondary }}
          </div>
          <UButton
            v-if="canChallenge(e.memberId, e.member.status)"
            size="xs"
            variant="soft"
            :loading="challenging === e.memberId"
            @click="challenge(e.memberId)"
          >
            Fordern
          </UButton>
        </div>
      </li>
    </ul>

    <p v-else class="text-muted italic">Keine Einträge.</p>
  </UContainer>
</template>
