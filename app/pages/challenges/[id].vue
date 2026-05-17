<script setup lang="ts">
import type { ChallengeDto, ChallengeStatus, DeclineReason } from '~~/server/modules/challenges'
import type { MatchOutcome, MatchResultDto, SetScore } from '~~/server/modules/results'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { user } = useUserSession()
const toast = useToast()
const { name: memberName } = await useMemberLookup()

const { data: challenge, refresh } = await useFetch<ChallengeDto>(
  () => `/api/challenges/${id.value}`,
)
const { data: result, refresh: refreshResult } = await useFetch<MatchResultDto | null>(
  () => `/api/match-results/by-challenge/${id.value}`,
  { default: () => null, watch: [() => challenge.value?.status] },
)

useHead({ title: () => (challenge.value ? `Forderung #${challenge.value.id}` : 'Forderung') })

const statusLabel: Record<ChallengeStatus, string> = {
  PROPOSED: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
}

const isChallenger = computed(() => challenge.value?.challengerId === user.value?.memberId)
const isChallenged = computed(() => challenge.value?.challengedId === user.value?.memberId)

// --- Decline-Flow ---
const showDecline = ref(false)
const declineReason = ref<DeclineReason>('injury')
const declineNote = ref('')
const submitting = ref(false)

async function accept() {
  submitting.value = true
  try {
    await $fetch(`/api/challenges/${id.value}/accept`, { method: 'POST' })
    toast.add({ title: 'Forderung angenommen', color: 'primary' })
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: (err as { statusMessage?: string }).statusMessage ?? '', color: 'error' })
  } finally {
    submitting.value = false
  }
}

async function decline() {
  submitting.value = true
  try {
    await $fetch(`/api/challenges/${id.value}/decline`, {
      method: 'POST',
      body: { reason: declineReason.value, note: declineNote.value || undefined },
    })
    toast.add({ title: 'Forderung abgelehnt', color: 'primary' })
    showDecline.value = false
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: (err as { statusMessage?: string }).statusMessage ?? '', color: 'error' })
  } finally {
    submitting.value = false
  }
}

// --- Result-Report-Flow ---
const showReport = ref(false)
const winnerIsMe = ref<boolean | null>(null)
const sets = ref<SetScore[]>([{ a: 0, b: 0 }, { a: 0, b: 0 }])
const outcome = ref<MatchOutcome>('regular')
const outcomeNote = ref('')

// Challenge-Matches werden derzeit hartcodiert im best-of-3-champions-Modus
// gemeldet — dort ist der 3. Satz immer ein Match-Tie-Break.
const CHALLENGE_MATCH_MODE = 'best-of-3-champions' as const
function isMatchTiebreakSet(setIndex: number): boolean {
  return (
    setIndex === 2 &&
    (CHALLENGE_MATCH_MODE === 'best-of-3-champions' ||
      (CHALLENGE_MATCH_MODE as string) === 'two-sets-match-tiebreak')
  )
}

function addSet() {
  if (sets.value.length < 3) sets.value.push({ a: 0, b: 0 })
}
function removeSet(i: number) {
  if (sets.value.length > 1) sets.value.splice(i, 1)
}

async function reportResult() {
  if (!challenge.value || winnerIsMe.value === null) return
  const winnerId = winnerIsMe.value
    ? user.value!.memberId
    : isChallenger.value
      ? challenge.value.challengedId
      : challenge.value.challengerId

  // Walk-Over → keine Sätze. Sonst: a = challenger, b = challenged.
  const orientedSets: SetScore[] =
    outcome.value === 'walkover'
      ? []
      : isChallenger.value
        ? sets.value
        : sets.value.map((s: SetScore) => ({ a: s.b, b: s.a }))

  submitting.value = true
  try {
    await $fetch(`/api/challenges/${id.value}/result`, {
      method: 'POST',
      body: {
        winnerId,
        sets: orientedSets,
        matchMode: 'best-of-3-champions',
        outcome: outcome.value,
        outcomeNote: outcomeNote.value.trim() || undefined,
      },
    })
    toast.add({ title: 'Ergebnis gemeldet — wartet auf Bestätigung', color: 'primary' })
    showReport.value = false
    await refresh()
    await refreshResult()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: (err as { statusMessage?: string }).statusMessage ?? '', color: 'error' })
  } finally {
    submitting.value = false
  }
}

// --- Result-Confirm-Flow ---
async function confirmResult() {
  if (!result.value) return
  submitting.value = true
  try {
    await $fetch(`/api/match-results/${result.value.id}/confirm`, { method: 'POST' })
    toast.add({ title: 'Ergebnis bestätigt — Rangliste aktualisiert', color: 'primary' })
    await refresh()
    await refreshResult()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: (err as { statusMessage?: string }).statusMessage ?? '', color: 'error' })
  } finally {
    submitting.value = false
  }
}

const showDispute = ref(false)
const disputeNote = ref('')
async function disputeResult() {
  if (!result.value) return
  submitting.value = true
  try {
    await $fetch(`/api/match-results/${result.value.id}/dispute`, {
      method: 'POST',
      body: { note: disputeNote.value },
    })
    toast.add({ title: 'Widerspruch eingelegt', color: 'primary' })
    showDispute.value = false
    await refresh()
    await refreshResult()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: (err as { statusMessage?: string }).statusMessage ?? '', color: 'error' })
  } finally {
    submitting.value = false
  }
}

// Wer ist Verlierer (für confirm)?
const isLoser = computed(() => {
  if (!result.value || !challenge.value || !user.value) return false
  const loserId =
    result.value.winnerId === challenge.value.challengerId
      ? challenge.value.challengedId
      : challenge.value.challengerId
  return user.value.memberId === loserId
})
</script>

<template>
  <UContainer v-if="challenge" class="py-6 max-w-2xl">
    <header class="mb-6">
      <NuxtLink to="/challenges" class="text-sm text-muted hover:text-default">
        ← Alle Forderungen
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">Forderung #{{ challenge.id }}</h1>
      <div class="text-sm text-muted mt-1">
        Status: <strong>{{ statusLabel[challenge.status] }}</strong> ·
        Rangliste #{{ challenge.rankingId }}
      </div>
    </header>

    <UCard class="mb-6">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-xs uppercase text-muted tracking-wider mb-1">Herausforderer</div>
          <div class="font-medium">{{ memberName(challenge.challengerId) }}</div>
          <div v-if="isChallenger" class="text-xs text-primary">(du)</div>
        </div>
        <div>
          <div class="text-xs uppercase text-muted tracking-wider mb-1">Herausgeforderter</div>
          <div class="font-medium">{{ memberName(challenge.challengedId) }}</div>
          <div v-if="isChallenged" class="text-xs text-primary">(du)</div>
        </div>
      </div>
      <div v-if="challenge.declineReason" class="mt-3 text-sm text-muted">
        Abgelehnt — Grund: <strong>{{ challenge.declineReason }}</strong>
        <span v-if="challenge.declineNote"> · {{ challenge.declineNote }}</span>
      </div>
    </UCard>

    <!-- PROPOSED: Annehmen/Ablehnen für Challenged -->
    <UCard v-if="challenge.status === 'PROPOSED' && isChallenged" class="mb-6">
      <h2 class="font-semibold mb-3">Was willst du tun?</h2>
      <div v-if="!showDecline" class="flex gap-2">
        <UButton color="primary" :loading="submitting" @click="accept">Annehmen</UButton>
        <UButton variant="soft" color="neutral" @click="showDecline = true">Ablehnen</UButton>
      </div>
      <form v-else class="space-y-3" @submit.prevent="decline">
        <UFormField label="Grund">
          <USelect
            v-model="declineReason"
            :items="[
              { label: 'Verletzung', value: 'injury' },
              { label: 'Urlaub', value: 'vacation' },
              { label: 'Beruflich', value: 'work' },
              { label: 'Sonstiges', value: 'other' },
            ]"
          />
        </UFormField>
        <UFormField label="Notiz (optional)">
          <UTextarea v-model="declineNote" :rows="2" class="w-full" />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="error" :loading="submitting">Ablehnen bestätigen</UButton>
          <UButton variant="ghost" color="neutral" @click="showDecline = false">Zurück</UButton>
        </div>
      </form>
    </UCard>

    <!-- ACCEPTED ohne Ergebnis: Ergebnis melden -->
    <UCard v-if="challenge.status === 'ACCEPTED' && !result" class="mb-6">
      <h2 class="font-semibold mb-3">Ergebnis melden</h2>
      <div v-if="!showReport">
        <UButton color="primary" @click="showReport = true">Ergebnis eintragen</UButton>
      </div>
      <form v-else class="space-y-4" @submit.prevent="reportResult">
        <UFormField label="Match-Ausgang">
          <URadioGroup
            v-model="outcome"
            :items="[
              { label: 'Reguläres Match', value: 'regular' },
              { label: 'Aufgabe (ret.) — letzter Satz darf unvollständig sein', value: 'retirement' },
              { label: 'Walk-Over (w.o.) — Gegner nicht angetreten', value: 'walkover' },
            ]"
          />
        </UFormField>
        <UFormField label="Sieger">
          <URadioGroup
            v-model="winnerIsMe"
            :items="[
              { label: 'Ich habe gewonnen', value: true },
              { label: 'Mein Gegner hat gewonnen', value: false },
            ]"
          />
        </UFormField>
        <template v-if="outcome !== 'walkover'">
          <div v-for="(set, i) in sets" :key="i">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted w-28">
                {{ isMatchTiebreakSet(i) ? 'Match-TB' : `Satz ${i + 1}` }}
              </span>
              <UInput v-model.number="set.a" type="number" min="0" max="20" class="w-20" />
              <span class="text-dimmed">:</span>
              <UInput v-model.number="set.b" type="number" min="0" max="20" class="w-20" />
              <UButton
                v-if="sets.length > 1"
                icon="i-lucide-x"
                variant="ghost"
                size="xs"
                @click="removeSet(i)"
              />
            </div>
            <p v-if="isMatchTiebreakSet(i)" class="text-xs text-muted pl-28 mt-1">
              bis 10 Punkte, mindestens 2 Vorsprung (z. B. 10:8, 12:10)
            </p>
          </div>
          <UButton v-if="sets.length < 3" variant="soft" size="sm" @click="addSet">+ Satz hinzufügen</UButton>
        </template>
        <p v-else class="text-sm text-muted italic">
          Kein Score erfasst — Walk-Over wird ohne Satz-Eingabe gemeldet.
        </p>
        <UFormField v-if="outcome !== 'regular'" label="Notiz (optional)">
          <UInput v-model="outcomeNote" placeholder="z. B. Verletzung Knie" class="w-full" />
        </UFormField>
        <div class="flex gap-2 pt-2">
          <UButton type="submit" color="primary" :loading="submitting" :disabled="winnerIsMe === null">
            Melden
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showReport = false">Abbrechen</UButton>
        </div>
      </form>
    </UCard>

    <!-- pending Result: Verlierer bestätigt oder widerspricht -->
    <UCard v-if="result && result.confirmationStatus === 'pending'" class="mb-6">
      <h2 class="font-semibold mb-3">Gemeldetes Ergebnis</h2>
      <div class="text-sm mb-3">
        Sieger: <strong>{{ memberName(result.winnerId) }}</strong>
        <span v-if="result.outcome === 'walkover'" class="ml-1 font-mono text-muted">w.o.</span>
        <br>
        <template v-if="result.outcome === 'walkover'">
          <span class="text-muted italic">kein Score</span>
        </template>
        <template v-else>
          Sätze:
          <span v-for="(s, i) in result.sets" :key="i" class="font-mono ml-1">
            {{ s.a }}:{{ s.b }}<span v-if="i < result.sets.length - 1">,</span>
          </span>
          <span v-if="result.outcome === 'retirement'" class="ml-1 font-mono text-muted">ret.</span>
        </template>
        <p v-if="result.outcomeNote" class="text-xs text-muted mt-1">
          {{ result.outcomeNote }}
        </p>
      </div>
      <div v-if="isLoser && !showDispute" class="flex gap-2">
        <UButton color="primary" :loading="submitting" @click="confirmResult">Bestätigen</UButton>
        <UButton variant="soft" color="error" @click="showDispute = true">Widersprechen</UButton>
      </div>
      <form v-else-if="showDispute" class="space-y-3" @submit.prevent="disputeResult">
        <UFormField label="Begründung">
          <UTextarea v-model="disputeNote" :rows="3" class="w-full" required />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="error" :loading="submitting">Widerspruch absenden</UButton>
          <UButton variant="ghost" color="neutral" @click="showDispute = false">Zurück</UButton>
        </div>
      </form>
      <p v-else class="text-sm text-muted italic">
        Warte auf Bestätigung durch den Verlierer.
      </p>
    </UCard>

    <!-- Confirmed Result: Read-only Anzeige -->
    <UCard v-if="result && result.confirmationStatus === 'confirmed'">
      <h2 class="font-semibold mb-3">Bestätigtes Ergebnis</h2>
      <div class="text-sm">
        Sieger: <strong>{{ memberName(result.winnerId) }}</strong>
        <span v-if="result.outcome === 'walkover'" class="ml-1 font-mono text-muted">w.o.</span>
        <br>
        <template v-if="result.outcome === 'walkover'">
          <span class="text-muted italic">kein Score</span>
        </template>
        <template v-else>
          Sätze:
          <span v-for="(s, i) in result.sets" :key="i" class="font-mono ml-1">
            {{ s.a }}:{{ s.b }}<span v-if="i < result.sets.length - 1">,</span>
          </span>
          <span v-if="result.outcome === 'retirement'" class="ml-1 font-mono text-muted">ret.</span>
        </template>
        <p v-if="result.outcomeNote" class="text-xs text-muted mt-1">
          {{ result.outcomeNote }}
        </p>
      </div>
    </UCard>

    <!-- Disputed Result -->
    <UCard v-if="result && result.confirmationStatus === 'disputed'">
      <h2 class="font-semibold mb-3 text-amber-700 dark:text-amber-400">Streitfall</h2>
      <div class="text-sm">
        Begründung: <em>{{ result.disputeNote ?? '—' }}</em>
        <p class="text-muted mt-2">
          Ein Trainer entscheidet den Streitfall.
        </p>
      </div>
    </UCard>
  </UContainer>
</template>
