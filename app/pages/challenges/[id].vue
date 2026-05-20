<script setup lang="ts">
import type { ChallengeDto, ChallengeStatus, DeclineReason } from '~~/server/modules/challenges'
import type { MatchOutcome, MatchResultDto, SetScore } from '~~/server/modules/results'
import { InvalidSetsError, validateSetsForMode } from '~~/shared/match-scoring'

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

useHead({ title: 'Forderung' })

const statusLabel: Record<ChallengeStatus, string> = {
  PROPOSED: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
  CANCELLED: 'Storniert',
}

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'dimmed'
const statusTone: Record<ChallengeStatus, StatusTone> = {
  PROPOSED: 'neutral',
  ACCEPTED: 'warning',
  DECLINED: 'danger',
  EXPIRED: 'dimmed',
  COMPLETED: 'success',
  DISPUTED: 'warning',
  CANCELLED: 'dimmed',
}

const declineReasonLabel: Record<DeclineReason, string> = {
  injury: 'Verletzung',
  vacation: 'Urlaub',
  work: 'Beruflich',
  other: 'Sonstiges',
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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
  } finally {
    submitting.value = false
  }
}

// --- Result-Report-Flow ---
const showReport = ref(false)
const winnerIsMe = ref<boolean | undefined>(undefined)
const sets = ref<SetScore[]>([{ a: 0, b: 0 }, { a: 0, b: 0 }])
const outcome = ref<MatchOutcome>('regular')
const outcomeNote = ref('')

// Challenge-Matches werden im einzigen aktiven Modus gemeldet (Issue #57) —
// dort ist der 3. Satz immer ein Match-Tie-Break.
const CHALLENGE_MATCH_MODE = 'two-sets-match-tiebreak' as const
function isMatchTiebreakSet(setIndex: number): boolean {
  return setIndex === 2
}

/**
 * Live-Score-Validierung pro Satzposition. Greift in den shared Validator
 * aus `server/shared/match-scoring`. Stumm, solange noch nicht alle Sätze
 * angetippt wurden — sonst piepst die UI bei jedem Tastendruck.
 */
const setErrors = computed<Record<number, string | undefined>>(() => {
  if (outcome.value === 'walkover') return {}
  const anyUntouched = sets.value.some((s: SetScore) => s.a === 0 && s.b === 0)
  if (anyUntouched) return {}
  const result: Record<number, string | undefined> = {}
  try {
    validateSetsForMode(CHALLENGE_MATCH_MODE, sets.value, { outcome: outcome.value })
  } catch (err) {
    if (err instanceof InvalidSetsError) {
      const e = err as Error
      const match = e.message.match(/Satz (\d+)/)
      const idx = match ? parseInt(match[1]!, 10) - 1 : 0
      result[idx] = e.message
    }
  }
  return result
})

function addSet() {
  if (sets.value.length < 3) sets.value.push({ a: 0, b: 0 })
}
function removeSet(i: number) {
  if (sets.value.length > 1) sets.value.splice(i, 1)
}

async function reportResult() {
  if (!challenge.value || winnerIsMe.value === undefined) return
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
        matchMode: CHALLENGE_MATCH_MODE,
        outcome: outcome.value,
        outcomeNote: outcomeNote.value.trim() || undefined,
      },
    })
    toast.add({ title: 'Ergebnis gemeldet — wartet auf Bestätigung', color: 'primary' })
    showReport.value = false
    await refresh()
    await refreshResult()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
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
  <UContainer v-if="challenge" class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <NuxtLink
        to="/challenges"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Forderungen
      </NuxtLink>
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight mt-2">
        Forderung
      </h1>
      <p class="text-sm text-muted mt-2 inline-flex items-center gap-1.5 flex-wrap">
        <span
          class="mono text-[10px] font-semibold tracking-[0.14em] uppercase"
          :class="{
            'text-[color:var(--success)]': statusTone[challenge.status] === 'success',
            'text-[color:var(--warning)]': statusTone[challenge.status] === 'warning',
            'text-[color:var(--danger)]': statusTone[challenge.status] === 'danger',
            'text-muted': statusTone[challenge.status] === 'neutral',
            'text-dimmed': statusTone[challenge.status] === 'dimmed',
          }"
        >
          {{ statusLabel[challenge.status] }}
        </span>
        <span class="dot-sep" aria-hidden="true" />
        <span>{{ challenge.rankingName }}</span>
      </p>
    </header>

    <!-- SPIELER -->
    <section class="anim anim-2 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Spieler</h2>
      </div>
      <div class="grid grid-cols-2 gap-0 border-y border-default">
        <div class="py-4 md:px-6 md:first:pl-0 border-r border-default pr-4">
          <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-2">
            Herausforderer
          </p>
          <p class="text-[15px] font-medium tracking-[-0.005em]">
            {{ memberName(challenge.challengerId) }}
            <span v-if="isChallenger" class="text-xs text-primary ml-1">(du)</span>
          </p>
        </div>
        <div class="py-4 pl-4 md:px-6">
          <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-2">
            Herausgeforderter
          </p>
          <p class="text-[15px] font-medium tracking-[-0.005em]">
            {{ memberName(challenge.challengedId) }}
            <span v-if="isChallenged" class="text-xs text-primary ml-1">(du)</span>
          </p>
        </div>
      </div>

      <div
        v-if="challenge.declineReason"
        class="mt-4 border-l-2 border-[color:var(--danger)] pl-3"
      >
        <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted">
          Abgelehnt · {{ declineReasonLabel[challenge.declineReason] }}
        </p>
        <p v-if="challenge.declineNote" class="text-sm text-muted italic mt-1">
          {{ challenge.declineNote }}
        </p>
      </div>
    </section>

    <!-- AKTION: Annehmen/Ablehnen -->
    <section
      v-if="challenge.status === 'PROPOSED' && isChallenged"
      class="anim anim-3 mb-12"
    >
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Was willst du tun?</h2>
      </div>
      <div v-if="!showDecline" class="flex flex-wrap gap-2">
        <UButton color="primary" icon="i-lucide-check" :loading="submitting" @click="accept">
          Annehmen
        </UButton>
        <UButton variant="soft" color="neutral" @click="showDecline = true">
          Ablehnen
        </UButton>
      </div>
      <form v-else class="space-y-4" @submit.prevent="decline">
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
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" color="error" :loading="submitting">
            Ablehnen bestätigen
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showDecline = false">
            Zurück
          </UButton>
        </div>
      </form>
    </section>

    <!-- ERGEBNIS MELDEN -->
    <section v-if="challenge.status === 'ACCEPTED' && !result" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Ergebnis melden</h2>
      </div>
      <div v-if="!showReport">
        <UButton color="primary" icon="i-lucide-trophy" @click="showReport = true">
          Ergebnis eintragen
        </UButton>
      </div>
      <form v-else class="space-y-5" @submit.prevent="reportResult">
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
              <span class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted w-28">
                {{ isMatchTiebreakSet(i) ? 'Match-TB' : `Satz ${i + 1}` }}
              </span>
              <UInputNumber v-model="set.a" :min="0" :max="isMatchTiebreakSet(i) ? 30 : 7" class="w-24" />
              <span class="text-dimmed font-mono">:</span>
              <UInputNumber v-model="set.b" :min="0" :max="isMatchTiebreakSet(i) ? 30 : 7" class="w-24" />
              <UButton
                v-if="sets.length > 1"
                icon="i-lucide-x"
                variant="ghost"
                size="xs"
                @click="removeSet(i)"
              />
            </div>
            <p v-if="setErrors[i]" class="text-xs text-[color:var(--danger)] pl-28 mt-1">
              {{ setErrors[i] }}
            </p>
            <p v-else-if="isMatchTiebreakSet(i)" class="text-xs text-muted pl-28 mt-1">
              bis 10 Punkte, mindestens 2 Vorsprung (z. B. 10:8, 12:10)
            </p>
          </div>
          <UButton v-if="sets.length < 3" variant="soft" size="sm" icon="i-lucide-plus" @click="addSet">
            Satz hinzufügen
          </UButton>
        </template>
        <p v-else class="text-sm text-muted italic">
          Kein Score erfasst — Walk-Over wird ohne Satz-Eingabe gemeldet.
        </p>
        <UFormField v-if="outcome !== 'regular'" label="Notiz (optional)">
          <UInput v-model="outcomeNote" placeholder="z. B. Verletzung Knie" class="w-full" />
        </UFormField>
        <div class="flex gap-2 pt-2">
          <UButton
            type="submit"
            color="primary"
            :loading="submitting"
            :disabled="winnerIsMe === undefined || Object.keys(setErrors).length > 0"
          >
            Melden
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showReport = false">
            Abbrechen
          </UButton>
        </div>
      </form>
    </section>

    <!-- ERGEBNIS PENDING -->
    <section v-if="result && result.confirmationStatus === 'pending'" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">
          Gemeldetes Ergebnis · <span class="text-[color:var(--warning)] normal-case tracking-normal">wartet auf Bestätigung</span>
        </h2>
      </div>
      <div class="border-y border-default py-5">
        <p class="text-xs text-muted mb-2 inline-flex items-center gap-1.5">
          <span class="mono text-[10px] font-semibold tracking-[0.18em] uppercase">Sieger</span>
          <span v-if="result.outcome === 'walkover'" class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--warning)]">w.o.</span>
          <span v-else-if="result.outcome === 'retirement'" class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--warning)]">ret.</span>
        </p>
        <p class="text-base font-semibold mb-3">
          {{ memberName(result.winnerId) }}
        </p>
        <p v-if="result.outcome === 'walkover'" class="text-sm text-muted italic">
          Kein Score erfasst.
        </p>
        <div v-else class="inline-flex items-center gap-3 font-mono tabular-nums">
          <span v-for="(s, i) in result.sets" :key="i" class="text-lg font-semibold">
            {{ s.a }}<span class="text-dimmed">:</span>{{ s.b }}
          </span>
        </div>
        <p v-if="result.outcomeNote" class="text-xs text-muted mt-2 italic">
          {{ result.outcomeNote }}
        </p>
      </div>

      <div v-if="isLoser && !showDispute" class="flex flex-wrap gap-2 mt-4">
        <UButton color="primary" icon="i-lucide-check" :loading="submitting" @click="confirmResult">
          Bestätigen
        </UButton>
        <UButton variant="soft" color="error" icon="i-lucide-flag" @click="showDispute = true">
          Widersprechen
        </UButton>
      </div>
      <form v-else-if="showDispute" class="space-y-3 mt-4" @submit.prevent="disputeResult">
        <UFormField label="Begründung">
          <UTextarea v-model="disputeNote" :rows="3" class="w-full" required />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="error" :loading="submitting">
            Widerspruch absenden
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showDispute = false">
            Zurück
          </UButton>
        </div>
      </form>
      <p v-else class="text-sm text-muted italic mt-4">
        Warte auf Bestätigung durch den Verlierer.
      </p>
    </section>

    <!-- ERGEBNIS BESTÄTIGT -->
    <section v-if="result && result.confirmationStatus === 'confirmed'" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">
          Endergebnis · <span class="text-[color:var(--success)] normal-case tracking-normal">bestätigt</span>
        </h2>
      </div>
      <div class="border-y border-default py-5">
        <p class="text-xs text-muted mb-2 inline-flex items-center gap-1.5">
          <span class="mono text-[10px] font-semibold tracking-[0.18em] uppercase">Sieger</span>
          <span v-if="result.outcome === 'walkover'" class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--warning)]">w.o.</span>
          <span v-else-if="result.outcome === 'retirement'" class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--warning)]">ret.</span>
        </p>
        <p class="text-base font-semibold mb-3">
          {{ memberName(result.winnerId) }}
        </p>
        <p v-if="result.outcome === 'walkover'" class="text-sm text-muted italic">
          Kein Score erfasst.
        </p>
        <div v-else class="inline-flex items-center gap-3 font-mono tabular-nums">
          <span v-for="(s, i) in result.sets" :key="i" class="text-lg font-semibold">
            {{ s.a }}<span class="text-dimmed">:</span>{{ s.b }}
          </span>
        </div>
        <p v-if="result.outcomeNote" class="text-xs text-muted mt-2 italic">
          {{ result.outcomeNote }}
        </p>
      </div>
    </section>

    <!-- ERGEBNIS STREITFALL -->
    <section v-if="result && result.confirmationStatus === 'disputed'" class="anim anim-4 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">
          Streitfall · <span class="text-[color:var(--warning)] normal-case tracking-normal">Trainer-Entscheidung ausstehend</span>
        </h2>
      </div>
      <div class="border-y border-default py-5 text-sm">
        <p><span class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted">Begründung</span></p>
        <p class="mt-1 italic">{{ result.disputeNote ?? '—' }}</p>
        <p class="text-muted mt-3">Ein Trainer entscheidet den Streitfall.</p>
      </div>
    </section>
  </UContainer>
</template>
