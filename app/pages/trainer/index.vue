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
                Challenge #{{ d.challengeId }} · Rangliste #{{ d.rankingId }}
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
      <h2 class="text-lg font-semibold mb-3">Aktivitäts-Übersicht</h2>
      <p class="text-xs text-muted mb-3">
        Sortiert nach Inaktivität — wer am wenigsten gespielt hat, steht oben.
        Zähler bezieht sich auf die letzten 4 Wochen.
      </p>

      <ul class="divide-y divide-default border border-default rounded-lg overflow-hidden">
        <li
          v-for="row in activity"
          :key="row.memberId"
          class="px-4 py-3 flex items-center justify-between gap-3"
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
        </li>
      </ul>
    </section>
  </UContainer>
</template>
