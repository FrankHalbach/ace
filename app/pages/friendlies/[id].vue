<script setup lang="ts">
import type {
  FriendlyDetailDto,
  FriendlyResultDto,
  FriendlyStatus,
  MatchOutcome,
  SetScore,
} from '~~/server/modules/friendlies'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { user } = useUserSession()
const toast = useToast()

const { name: memberName } = await useMemberLookup()

const { data: friendly, refresh } = await useFetch<FriendlyDetailDto>(
  () => `/api/friendlies/${id.value}`,
)
const { data: result, refresh: refreshResult } = await useFetch<FriendlyResultDto | null>(
  () => `/api/friendly-results/by-friendly/${id.value}`,
  { default: () => null, watch: [() => friendly.value?.status] },
)

useHead({ title: () => (friendly.value ? `Freundschaftsspiel #${friendly.value.id}` : 'Freundschaftsspiel') })

const me = computed(() => user.value?.memberId)

const isInitiator = computed(() => friendly.value?.initiatorId === me.value)

const myInvitee = computed(() =>
  friendly.value?.invitees.find((i) => i.memberId === me.value),
)

// Sieger-Team-Klassifikation für Result-Ansicht
const initiatorTeam = computed(() => {
  if (!friendly.value) return []
  const ids = [friendly.value.initiatorId]
  for (const i of friendly.value.invitees) if (i.team === 'initiator') ids.push(i.memberId)
  return ids
})
const opponentTeam = computed(() => {
  if (!friendly.value) return []
  return friendly.value.invitees.filter((i) => i.team === 'opponent').map((i) => i.memberId)
})

const winnerIsInitiatorTeam = computed(() => {
  if (!result.value || initiatorTeam.value.length === 0) return false
  const winSet = new Set(result.value.winnerMemberIds)
  return (
    winSet.size === initiatorTeam.value.length &&
    initiatorTeam.value.every((id) => winSet.has(id))
  )
})

const isInLoserTeam = computed(() => {
  if (!result.value || !me.value) return false
  const loser = winnerIsInitiatorTeam.value ? opponentTeam.value : initiatorTeam.value
  return loser.includes(me.value)
})

const statusLabel: Record<FriendlyStatus, string> = {
  PROPOSED: 'Offen',
  CONFIRMED: 'Bestätigt',
  DECLINED: 'Abgelehnt',
  CANCELLED: 'Abgesagt',
  PLAYED: 'Gespielt',
  COMPLETED: 'Abgeschlossen',
  DISPUTED: 'Strittig',
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const submitting = ref(false)

async function callAction(path: string, body?: Record<string, unknown>): Promise<boolean> {
  submitting.value = true
  try {
    await $fetch(path, { method: 'POST', body })
    await refresh()
    await refreshResult()
    return true
  } catch (err: unknown) {
    toast.add({
      title: 'Fehler',
      description: (err as { statusMessage?: string }).statusMessage ?? 'Unbekannter Fehler',
      color: 'error',
    })
    return false
  } finally {
    submitting.value = false
  }
}

// ─── Result-Reporting ──────────────────────────────────────────────────────
const showReport = ref(false)
const myTeamWon = ref<boolean | null>(null)
const sets = ref<SetScore[]>([{ a: 0, b: 0 }, { a: 0, b: 0 }])
const outcome = ref<MatchOutcome>('regular')
const outcomeNote = ref('')

// In best-of-3-champions und two-sets-match-tiebreak ist der 3. Satz ein
// Match-Tie-Break.
function isMatchTiebreakSet(setIndex: number): boolean {
  if (setIndex !== 2) return false
  const mode = friendly.value?.matchMode
  return mode === 'best-of-3-champions' || mode === 'two-sets-match-tiebreak'
}

function addSet() {
  if (sets.value.length < 3) sets.value.push({ a: 0, b: 0 })
}
function removeSet(i: number) {
  if (sets.value.length > 1) sets.value.splice(i, 1)
}

const myTeam = computed(() => {
  if (!friendly.value || !me.value) return []
  if (initiatorTeam.value.includes(me.value)) return initiatorTeam.value
  return opponentTeam.value
})

const otherTeam = computed(() =>
  myTeam.value === initiatorTeam.value ? opponentTeam.value : initiatorTeam.value,
)

async function reportResult() {
  if (!friendly.value || myTeamWon.value === null) return
  const winnerIds = myTeamWon.value ? myTeam.value : otherTeam.value

  // Spielfeld-Seite A entspricht dem Initiator-Team — wenn ich nicht im
  // Initiator-Team bin, muss ich die Sätze spiegeln. Walk-Over: keine Sätze.
  const iAmInitiator = initiatorTeam.value.includes(me.value!)
  const orientedSets: SetScore[] =
    outcome.value === 'walkover'
      ? []
      : iAmInitiator
        ? sets.value
        : sets.value.map((s: SetScore) => ({ a: s.b, b: s.a }))

  const ok = await callAction(`/api/friendlies/${id.value}/result`, {
    winnerMemberIds: winnerIds,
    sets: orientedSets,
    outcome: outcome.value,
    outcomeNote: outcomeNote.value.trim() || undefined,
  })
  if (ok) {
    toast.add({ title: 'Ergebnis gemeldet — wartet auf Bestätigung', color: 'primary' })
    showReport.value = false
  }
}

const showDispute = ref(false)
const disputeNote = ref('')

async function confirmResult() {
  if (!result.value) return
  const ok = await callAction(`/api/friendly-results/${result.value.id}/confirm`)
  if (ok) toast.add({ title: 'Ergebnis bestätigt', color: 'primary' })
}

async function disputeResult() {
  if (!result.value) return
  const ok = await callAction(`/api/friendly-results/${result.value.id}/dispute`, {
    note: disputeNote.value,
  })
  if (ok) {
    toast.add({ title: 'Widerspruch eingelegt', color: 'primary' })
    showDispute.value = false
  }
}

async function accept() {
  const ok = await callAction(`/api/friendlies/${id.value}/accept`)
  if (ok) toast.add({ title: 'Eingeladung angenommen', color: 'primary' })
}
async function decline() {
  const ok = await callAction(`/api/friendlies/${id.value}/decline`)
  if (ok) toast.add({ title: 'Eingeladung abgelehnt', color: 'primary' })
}
async function cancel() {
  const ok = await callAction(`/api/friendlies/${id.value}/cancel`)
  if (ok) toast.add({ title: 'Freundschaftsspiel abgesagt', color: 'primary' })
}
async function markPlayed() {
  const ok = await callAction(`/api/friendlies/${id.value}/mark-played`)
  if (ok) toast.add({ title: 'Als „gespielt" markiert', color: 'primary' })
}
</script>

<template>
  <UContainer v-if="friendly" class="py-6 max-w-2xl">
    <header class="mb-6">
      <NuxtLink to="/friendlies" class="text-sm text-muted hover:text-default">
        ← Alle Freundschaftsspiele
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">
        {{ friendly.format === 'singles' ? 'Einzel' : 'Doppel' }}-Freundschaftsspiel
      </h1>
      <div class="text-sm text-muted mt-1">
        Status: <strong>{{ statusLabel[friendly.status] }}</strong> ·
        {{ formatDate(friendly.scheduledAt) }}
        <span v-if="friendly.courtInfo"> · {{ friendly.courtInfo }}</span>
      </div>
    </header>

    <UCard class="mb-6">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-xs uppercase text-muted tracking-wider mb-1">
            {{ friendly.format === 'doubles' ? 'Initiator-Team' : 'Initiator' }}
          </div>
          <div v-for="mid in initiatorTeam" :key="mid" class="font-medium">
            {{ memberName(mid) }}
            <span v-if="mid === me" class="text-xs text-primary">(du)</span>
          </div>
        </div>
        <div>
          <div class="text-xs uppercase text-muted tracking-wider mb-1">
            {{ friendly.format === 'doubles' ? 'Gegner-Team' : 'Gegner' }}
          </div>
          <div v-for="mid in opponentTeam" :key="mid" class="font-medium">
            {{ memberName(mid) }}
            <span v-if="mid === me" class="text-xs text-primary">(du)</span>
          </div>
        </div>
      </div>
      <div v-if="friendly.invitees.length > 0" class="mt-4 text-xs text-muted">
        <div v-for="i in friendly.invitees" :key="i.id">
          {{ memberName(i.memberId) }} ·
          <span v-if="i.status === 'pending'">offen</span>
          <span v-else-if="i.status === 'accepted'" class="text-emerald-700 dark:text-emerald-400">angenommen</span>
          <span v-else class="text-red-700 dark:text-red-400">abgelehnt</span>
        </div>
      </div>
      <div v-if="friendly.note" class="mt-3 text-sm text-muted">
        Notiz: <em>{{ friendly.note }}</em>
      </div>
    </UCard>

    <!-- PROPOSED: Eingeladener kann an-/ablehnen -->
    <UCard v-if="friendly.status === 'PROPOSED' && myInvitee && myInvitee.status === 'pending'" class="mb-6">
      <h2 class="font-semibold mb-3">Was willst du tun?</h2>
      <div class="flex gap-2">
        <UButton color="primary" :loading="submitting" @click="accept">Annehmen</UButton>
        <UButton variant="soft" color="neutral" :loading="submitting" @click="decline">Ablehnen</UButton>
      </div>
    </UCard>

    <!-- Initiator: Absagen, solange nicht COMPLETED/DISPUTED/CANCELLED/DECLINED -->
    <UCard
      v-if="isInitiator && !['COMPLETED', 'DISPUTED', 'CANCELLED', 'DECLINED'].includes(friendly.status)"
      class="mb-6"
    >
      <h2 class="font-semibold mb-3">Aktionen</h2>
      <div class="flex flex-wrap gap-2">
        <UButton variant="soft" color="error" :loading="submitting" @click="cancel">Absagen</UButton>
      </div>
    </UCard>

    <!-- CONFIRMED: Ergebnis melden oder „nur gespielt" -->
    <UCard v-if="(friendly.status === 'CONFIRMED' || friendly.status === 'PLAYED') && !result" class="mb-6">
      <h2 class="font-semibold mb-3">Nach dem Match</h2>
      <div v-if="!showReport" class="flex flex-wrap gap-2">
        <UButton color="primary" @click="showReport = true">Ergebnis eintragen</UButton>
        <UButton
          v-if="friendly.status === 'CONFIRMED'"
          variant="soft"
          color="neutral"
          :loading="submitting"
          @click="markPlayed"
        >
          Nur gespielt, kein Ergebnis
        </UButton>
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
        <UFormField :label="friendly.format === 'doubles' ? 'Sieger-Team' : 'Sieger'">
          <URadioGroup
            v-model="myTeamWon"
            :items="
              friendly.format === 'doubles'
                ? [
                    { label: 'Mein Team hat gewonnen', value: true },
                    { label: 'Das andere Team hat gewonnen', value: false },
                  ]
                : [
                    { label: 'Ich habe gewonnen', value: true },
                    { label: 'Mein Gegner hat gewonnen', value: false },
                  ]
            "
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
        <p class="text-xs text-muted">
          Sätze aus deiner Sicht eintragen — links =
          {{ friendly.format === 'doubles' ? 'dein Team' : 'du' }}.
        </p>
        <div class="flex gap-2 pt-2">
          <UButton
            type="submit"
            color="primary"
            :loading="submitting"
            :disabled="myTeamWon === null"
          >
            Melden
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showReport = false">Abbrechen</UButton>
        </div>
      </form>
    </UCard>

    <!-- pending Result: Verlierer-Team bestätigt oder widerspricht -->
    <UCard v-if="result && result.confirmationStatus === 'pending'" class="mb-6">
      <h2 class="font-semibold mb-3">Gemeldetes Ergebnis</h2>
      <div class="text-sm mb-3">
        Sieger:
        <strong v-for="(mid, i) in result.winnerMemberIds" :key="mid">
          {{ memberName(mid) }}<span v-if="i < result.winnerMemberIds.length - 1">, </span>
        </strong>
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
      <div v-if="isInLoserTeam && !showDispute" class="flex gap-2">
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
        Warte auf Bestätigung durch
        {{ friendly.format === 'doubles' ? 'das Verlierer-Team' : 'den Verlierer' }}.
      </p>
    </UCard>

    <!-- Confirmed Result -->
    <UCard v-if="result && result.confirmationStatus === 'confirmed'">
      <h2 class="font-semibold mb-3">Bestätigtes Ergebnis</h2>
      <div class="text-sm">
        Sieger:
        <strong v-for="(mid, i) in result.winnerMemberIds" :key="mid">
          {{ memberName(mid) }}<span v-if="i < result.winnerMemberIds.length - 1">, </span>
        </strong>
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
        <p class="text-muted mt-2">Ein Trainer entscheidet den Streitfall.</p>
      </div>
    </UCard>
  </UContainer>
</template>
