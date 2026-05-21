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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
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
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Trainer
      </h1>
      <p class="text-sm text-muted mt-2">
        Streitfälle entscheiden und Spieler-Aktivität im Blick behalten.
      </p>
    </header>

    <!-- STREITFÄLLE -->
    <section class="anim anim-2 mb-14">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Streitfälle · {{ disputes.length }}</h2>
      </div>

      <p v-if="disputes.length === 0" class="text-sm text-muted italic py-6">
        Keine offenen Streitfälle.
      </p>

      <ul v-else class="divide-y divide-default border-y border-default">
        <li
          v-for="d in disputes"
          :key="`${d.kind}-${d.kind === 'challenge' ? d.challengeId : d.friendlyId}`"
          class="py-5"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-[color:var(--warning,var(--accent))] mb-1.5 inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-alert-triangle" class="size-3" />
                {{ d.kind === 'challenge' ? 'Forderung' : (d.format === 'singles' ? 'Einzel-Friendly' : 'Doppel-Friendly') }}
              </div>
              <div class="text-[15px] font-semibold tracking-[-0.005em] mb-1">
                <template v-if="d.kind === 'challenge'">
                  <span class="italic text-primary">{{ memberName(d.challengerId) }}</span>
                  <span class="text-muted font-normal mx-1.5">vs</span>
                  <span class="italic text-primary">{{ memberName(d.challengedId) }}</span>
                </template>
                <template v-else>
                  <span
                    v-for="(p, i) in d.participants"
                    :key="p"
                  >
                    <span class="italic text-primary">{{ memberName(p) }}</span>
                    <span v-if="i < d.participants.length - 1" class="text-muted font-normal mx-1.5">·</span>
                  </span>
                </template>
              </div>
              <div class="text-xs text-muted">
                <template v-if="d.kind === 'challenge'">
                  <template v-if="d.reportedWinnerId !== null">
                    Sieger laut Meldung: {{ memberName(d.reportedWinnerId) }}
                    <span class="font-mono tabular-nums ml-1">· {{ formatSets(d.reportedSets) }}</span>
                  </template>
                  <em v-else>kein Ergebnis gemeldet</em>
                </template>
                <template v-else>
                  Sieger laut Meldung:
                  <span v-for="(w, i) in d.reportedWinnerIds" :key="w">
                    {{ memberName(w) }}<span v-if="i < d.reportedWinnerIds.length - 1">, </span>
                  </span>
                  <span class="font-mono tabular-nums ml-1">· {{ formatSets(d.reportedSets) }}</span>
                </template>
              </div>
              <div v-if="d.disputeNote" class="text-sm text-muted mt-2 italic">
                „{{ d.disputeNote }}"
              </div>
              <div class="text-xs text-dimmed mt-1.5">
                {{ relativeDays(d.disputedAt) }}
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 mt-4">
            <UButton
              v-if="(d.kind === 'challenge' && d.reportedWinnerId !== null) || d.kind === 'friendly'"
              color="primary"
              size="sm"
              icon="i-lucide-check"
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
              icon="i-lucide-x"
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
        </li>
      </ul>
    </section>

    <!-- AKTIVITÄT -->
    <section class="anim anim-3">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Aktivität · 4 Wochen</h2>
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

      <ul v-else class="divide-y divide-default border-y border-default">
        <li v-for="row in filteredActivity" :key="row.memberId">
          <NuxtLink :to="`/spieler/${row.memberId}`" class="list-row group">
            <span
              class="font-mono tabular-nums text-sm font-semibold min-w-[2.5rem] text-center px-1.5 py-1 rounded ring-1 ring-default text-muted shrink-0"
              :title="`${row.matchesLast4Weeks} Matches in 4 Wochen`"
            >
              {{ row.matchesLast4Weeks }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                <span class="italic text-primary">{{ row.firstName }}</span>
                <span class="ml-1">{{ row.lastName }}</span>
              </div>
              <div class="text-xs text-muted truncate mt-0.5">
                {{ relativeDays(row.lastMatchAt) }}
                <template v-if="row.status === 'pausiert'">
                  · <span class="text-[color:var(--neutral,var(--ink-soft))]">pausiert</span>
                </template>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="text-dimmed shrink-0 group-hover:text-primary transition-colors" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
