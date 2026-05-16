<script setup lang="ts">
import type {
  ActivityOverviewRow,
  DisputeListItem,
} from '~~/server/modules/trainer'

definePageMeta({ middleware: 'trainer' })
useHead({ title: 'Trainer' })

const toast = useToast()
const { name: memberName } = await useMemberLookup()

const { data: disputes, refresh: refreshDisputes } = await useFetch<DisputeListItem[]>(
  '/api/trainer/disputes',
  { default: () => [] },
)
const { data: activity, refresh: refreshActivity } = await useFetch<ActivityOverviewRow[]>(
  '/api/trainer/activity',
  { default: () => [] },
)

const submitting = ref<string | null>(null)

async function action(path: string, key: string, successMsg: string) {
  submitting.value = key
  try {
    await $fetch(path, { method: 'POST' })
    toast.add({ title: successMsg, color: 'primary' })
    await refreshDisputes()
    await refreshActivity()
  } catch (err: unknown) {
    toast.add({
      title: 'Fehler',
      description: (err as { statusMessage?: string }).statusMessage ?? '',
      color: 'error',
    })
  } finally {
    submitting.value = null
  }
}

function relativeDays(d: Date | string | null): string {
  if (!d) return '– noch nie –'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function formatSets(sets: { a: number; b: number }[] | null): string {
  if (!sets || sets.length === 0) return '—'
  return sets.map((s) => `${s.a}:${s.b}`).join(', ')
}

// ─── Sortierung der Aktivitäts-Tabelle ──────────────────────────────────────
// Bewusst nur zwei Modi — die Trainer-Use-Cases sind „wen anstupsen" und
// „wer ist gerade aktiv". Alles andere wäre Tabellen-Spielerei ohne Mehrwert.
type ActivitySort = 'inactive-first' | 'most-active'
const activitySort = ref<ActivitySort>('inactive-first')
const activitySearch = ref('')

const sortedActivity = computed(() => {
  const rows = [...(activity.value ?? [])]
  if (activitySort.value === 'most-active') {
    rows.sort((a, b) => b.matchesLast4Weeks - a.matchesLast4Weeks)
    return rows
  }
  // inactive-first: NULL zuerst, dann ältestes lastMatchAt
  rows.sort((a, b) => {
    if (a.lastMatchAt === null && b.lastMatchAt === null) return 0
    if (a.lastMatchAt === null) return -1
    if (b.lastMatchAt === null) return 1
    return new Date(a.lastMatchAt).getTime() - new Date(b.lastMatchAt).getTime()
  })
  return rows
})

const filteredActivity = computed<ActivityOverviewRow[]>(() => {
  const q = activitySearch.value.trim().toLowerCase()
  if (!q) return sortedActivity.value
  return sortedActivity.value.filter((row: ActivityOverviewRow) =>
    `${row.firstName} ${row.lastName}`.toLowerCase().includes(q),
  )
})
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <h1 class="text-2xl font-semibold mb-6">Trainer</h1>

    <section class="mb-10">
      <h2 class="text-lg font-semibold mb-3">
        Streitfälle <span class="text-muted">({{ disputes.length }})</span>
      </h2>

      <p v-if="disputes.length === 0" class="text-muted italic">
        Keine offenen Streitfälle.
      </p>

      <div v-else class="space-y-3">
        <UCard v-for="d in disputes" :key="`${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`">
          <div class="text-sm">
            <div class="font-medium mb-1">
              <span v-if="d.kind === 'challenge'">
                Forderung #{{ d.challengeId }} · Rangliste #{{ d.rankingId }}
              </span>
              <span v-else>
                {{ d.format === 'singles' ? 'Einzel' : 'Doppel' }}-Friendly #{{ d.friendlyId }}
              </span>
            </div>
            <div v-if="d.kind === 'challenge'" class="text-muted">
              {{ memberName(d.challengerId) }} vs {{ memberName(d.challengedId) }}
              <template v-if="d.reportedWinnerId !== null">
                · Sieger laut Meldung: {{ memberName(d.reportedWinnerId) }}
                · {{ formatSets(d.reportedSets) }}
              </template>
              <template v-else>
                · <em>kein Ergebnis gemeldet</em>
              </template>
            </div>
            <div v-else class="text-muted">
              Teilnehmer:
              <span v-for="(p, i) in d.participants" :key="p">
                {{ memberName(p) }}<span v-if="i < d.participants.length - 1">, </span>
              </span>
              · Sieger laut Meldung:
              <span v-for="(w, i) in d.reportedWinnerIds" :key="w">
                {{ memberName(w) }}<span v-if="i < d.reportedWinnerIds.length - 1">, </span>
              </span>
              · {{ formatSets(d.reportedSets) }}
            </div>
            <div v-if="d.disputeNote" class="mt-2 text-sm">
              Begründung: <em>{{ d.disputeNote }}</em>
            </div>
            <div class="text-xs text-dimmed mt-1">
              {{ relativeDays(d.disputedAt) }}
            </div>
          </div>

          <div class="flex flex-wrap gap-2 mt-4">
            <UButton
              v-if="(d.kind === 'challenge' && d.reportedWinnerId !== null) || d.kind === 'friendly'"
              color="primary"
              size="sm"
              :loading="submitting === `confirm-${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`"
              @click="
                action(
                  d.kind === 'challenge'
                    ? `/api/trainer/disputes/challenge/${d.challengeId}/confirm`
                    : `/api/trainer/disputes/friendly/${d.friendlyId}/confirm`,
                  `confirm-${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`,
                  'Bestätigt — Match abgeschlossen',
                )
              "
            >
              Bestätigen wie gemeldet
            </UButton>
            <UButton
              variant="soft"
              color="error"
              size="sm"
              :loading="submitting === `cancel-${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`"
              @click="
                action(
                  d.kind === 'challenge'
                    ? `/api/trainer/disputes/challenge/${d.challengeId}/cancel`
                    : `/api/trainer/disputes/friendly/${d.friendlyId}/cancel`,
                  `cancel-${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`,
                  'Match abgebrochen',
                )
              "
            >
              Match abbrechen
            </UButton>
          </div>
        </UCard>
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 class="text-lg font-semibold">Aktivitäts-Übersicht</h2>
        <div class="flex gap-1">
          <UButton
            size="xs"
            :variant="activitySort === 'inactive-first' ? 'solid' : 'ghost'"
            color="neutral"
            @click="activitySort = 'inactive-first'"
          >
            Inaktive zuerst
          </UButton>
          <UButton
            size="xs"
            :variant="activitySort === 'most-active' ? 'solid' : 'ghost'"
            color="neutral"
            @click="activitySort = 'most-active'"
          >
            Aktivste zuerst
          </UButton>
        </div>
      </div>
      <UInput
        v-model="activitySearch"
        icon="i-lucide-search"
        placeholder="Spieler suchen…"
        class="w-full mb-3"
      />

      <p class="text-xs text-muted mb-3">
        Match-Anzahl bezieht sich auf die letzten 4 Wochen.
        <span v-if="activitySearch.trim()" class="ml-1">
          · {{ filteredActivity.length }} von {{ sortedActivity.length }} Spielern
        </span>
      </p>

      <p v-if="filteredActivity.length === 0" class="text-sm text-muted italic">
        Kein Treffer für „{{ activitySearch }}".
      </p>

      <div v-else class="divide-y divide-default border border-default rounded-lg overflow-hidden">
        <NuxtLink
          v-for="row in filteredActivity"
          :key="row.memberId"
          :to="`/spieler/${row.memberId}`"
          class="block px-4 py-3 flex items-center justify-between gap-3 hover:bg-elevated transition"
        >
          <div>
            <div class="font-medium">
              {{ row.firstName }} {{ row.lastName }}
              <span v-if="row.status === 'pausiert'" class="ml-1 text-xs text-dimmed">
                · pausiert
              </span>
            </div>
            <div class="text-xs text-muted">
              Letzte Aktivität: {{ relativeDays(row.lastMatchAt) }}
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono text-sm">{{ row.matchesLast4Weeks }}</div>
            <div class="text-xs text-dimmed">4 Wochen</div>
          </div>
        </NuxtLink>
      </div>
    </section>
  </UContainer>
</template>
