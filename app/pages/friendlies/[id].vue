<script setup lang="ts">
import type {
  FriendlyDetailDto,
  FriendlyResultDto,
  FriendlyStatus,
  MatchOutcome,
  SetScore,
} from '~~/server/modules/friendlies'
import { InvalidSetsError, validateSetsForMode } from '~~/shared/match-scoring'

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

useHead({ title: 'Freundschaftsspiel' })

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

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'dimmed'
const statusTone: Record<FriendlyStatus, StatusTone> = {
  PROPOSED: 'neutral',
  CONFIRMED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'dimmed',
  PLAYED: 'warning',
  COMPLETED: 'success',
  DISPUTED: 'warning',
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

const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function heroDateChip(d: Date | string): { weekday: string; dm: string; time: string } {
  const date = new Date(d)
  return {
    weekday: weekdayFmt.format(date),
    dm: dayMonthFmt.format(date),
    time: timeFmt.format(date),
  }
}

const submitting = ref(false)

/** Liegt der geplante Termin in der Zukunft? — Result-Reporting blockt davor. */
const isInFuture = computed(
  () => friendly.value !== null && friendly.value !== undefined && new Date(friendly.value.scheduledAt).getTime() > Date.now(),
)

/**
 * N-05: Sind wir innerhalb des Late-Cancel-Fensters? Wenn ja, sind
 * Decline-/Cancel-Buttons disabled. Server lehnt sowieso ab — der Check
 * hier ist eine UX-Vorwegnahme. Reaktiviert sich nicht live (kein Ticker);
 * wer 30min wartet und es trotzdem klickt, kriegt den Toast-Fehler.
 */
const isLateCancellation = computed(() => {
  if (!friendly.value) return false
  return Date.now() >= new Date(friendly.value.cancellationLockedAt).getTime()
})

const lateCancelTooltip = computed(() => {
  if (!friendly.value) return ''
  return `Absage nicht mehr möglich — Deadline war ${formatDate(friendly.value.cancellationLockedAt)}.`
})

async function callAction(path: string, body?: Record<string, unknown>): Promise<boolean> {
  submitting.value = true
  try {
    await $fetch(path, { method: 'POST', body })
    await refresh()
    await refreshResult()
    return true
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
    return false
  } finally {
    submitting.value = false
  }
}

// ─── Result-Reporting ──────────────────────────────────────────────────────
const showReport = ref(false)
const myTeamWon = ref<boolean | undefined>(undefined)
const sets = ref<SetScore[]>([{ a: 0, b: 0 }, { a: 0, b: 0 }])
const outcome = ref<MatchOutcome>('regular')
const outcomeNote = ref('')

function isMatchTiebreakSet(setIndex: number): boolean {
  return setIndex === 2 && friendly.value?.matchMode === 'two-sets-match-tiebreak'
}

/**
 * Live-Score-Validierung pro Satzposition. Stumm, solange noch nicht alle
 * Sätze angetippt wurden — sonst piepst die UI bei jedem Tastendruck.
 */
const setErrors = computed<Record<number, string | undefined>>(() => {
  if (outcome.value === 'walkover' || !friendly.value) return {}
  const anyUntouched = sets.value.some((s: SetScore) => s.a === 0 && s.b === 0)
  if (anyUntouched) return {}
  const result: Record<number, string | undefined> = {}
  try {
    validateSetsForMode(friendly.value.matchMode, sets.value, { outcome: outcome.value })
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

const myTeam = computed(() => {
  if (!friendly.value || !me.value) return []
  if (initiatorTeam.value.includes(me.value)) return initiatorTeam.value
  return opponentTeam.value
})

const otherTeam = computed(() =>
  myTeam.value === initiatorTeam.value ? opponentTeam.value : initiatorTeam.value,
)

async function reportResult() {
  if (!friendly.value || myTeamWon.value === undefined) return
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
  <UContainer v-if="friendly" class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <NuxtLink
        to="/friendlies"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Freundschaftsspiele
      </NuxtLink>
      <div class="flex items-start justify-between gap-4 mt-2 flex-wrap">
        <div class="min-w-0">
          <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
            {{ friendly.format === 'singles' ? 'Einzel' : 'Doppel' }}-Freundschaftsspiel
          </h1>
          <p class="text-sm text-muted mt-2 inline-flex items-center gap-1.5 flex-wrap">
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase"
              :class="{
                'text-[color:var(--success)]': statusTone[friendly.status] === 'success',
                'text-[color:var(--warning)]': statusTone[friendly.status] === 'warning',
                'text-[color:var(--danger)]': statusTone[friendly.status] === 'danger',
                'text-muted': statusTone[friendly.status] === 'neutral',
                'text-dimmed': statusTone[friendly.status] === 'dimmed',
              }"
            >
              {{ statusLabel[friendly.status] }}
            </span>
            <template v-if="friendly.courtInfo">
              <span class="dot-sep" aria-hidden="true" />
              <span>{{ friendly.courtInfo }}</span>
            </template>
          </p>
        </div>
        <span class="date-chip font-mono shrink-0" style="min-width: 72px; padding: 10px 12px">
          <span class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted leading-none">
            {{ heroDateChip(friendly.scheduledAt).weekday }}
          </span>
          <span class="text-base font-semibold tabular-nums leading-none mt-1.5">
            {{ heroDateChip(friendly.scheduledAt).dm }}
          </span>
          <span class="text-xs text-dimmed tabular-nums leading-none mt-1">
            {{ heroDateChip(friendly.scheduledAt).time }}
          </span>
        </span>
      </div>
    </header>

    <!-- SPIELER -->
    <section class="anim anim-2 mb-12">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Spieler</h2>
      </div>
      <div class="grid grid-cols-2 gap-0 border-y border-default">
        <div class="py-4 md:px-6 md:first:pl-0 border-r border-default pr-4">
          <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-2">
            {{ friendly.format === 'doubles' ? 'Initiator-Team' : 'Initiator' }}
          </p>
          <ul class="space-y-1">
            <li v-for="mid in initiatorTeam" :key="mid" class="text-[15px] font-medium tracking-[-0.005em]">
              {{ memberName(mid) }}
              <span v-if="mid === me" class="text-xs text-primary ml-1">(du)</span>
            </li>
          </ul>
        </div>
        <div class="py-4 pl-4 md:px-6">
          <p class="mono text-[10px] font-semibold tracking-[0.18em] uppercase text-muted mb-2">
            {{ friendly.format === 'doubles' ? 'Gegner-Team' : 'Gegner' }}
          </p>
          <ul class="space-y-1">
            <li v-for="mid in opponentTeam" :key="mid" class="text-[15px] font-medium tracking-[-0.005em]">
              {{ memberName(mid) }}
              <span v-if="mid === me" class="text-xs text-primary ml-1">(du)</span>
            </li>
          </ul>
        </div>
      </div>

      <ul v-if="friendly.invitees.length > 0" class="mt-3 text-xs space-y-1">
        <li
          v-for="i in friendly.invitees"
          :key="i.id"
          class="inline-flex items-center gap-1.5 mr-3"
        >
          <span class="text-muted">{{ memberName(i.memberId) }}</span>
          <span
            class="mono text-[10px] font-semibold tracking-[0.14em] uppercase"
            :class="{
              'text-muted': i.status === 'pending',
              'text-[color:var(--success)]': i.status === 'accepted',
              'text-[color:var(--danger)]': i.status === 'declined',
            }"
          >
            {{ i.status === 'pending' ? 'offen' : i.status === 'accepted' ? 'angenommen' : 'abgelehnt' }}
          </span>
        </li>
      </ul>

      <p v-if="friendly.note" class="mt-4 text-sm text-muted italic border-l-2 border-[color:var(--accent)] pl-3">
        {{ friendly.note }}
      </p>
    </section>

    <!-- AKTION: Eingeladener (PROPOSED + pending) -->
    <section
      v-if="friendly.status === 'PROPOSED' && myInvitee && myInvitee.status === 'pending'"
      class="anim anim-3 mb-12"
    >
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Was willst du tun?</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton color="primary" icon="i-lucide-check" :loading="submitting" @click="accept">
          Annehmen
        </UButton>
        <UTooltip v-if="isLateCancellation" :text="lateCancelTooltip">
          <UButton variant="soft" color="neutral" disabled>Ablehnen</UButton>
        </UTooltip>
        <UButton
          v-else
          variant="soft"
          color="neutral"
          :loading="submitting"
          @click="decline"
        >
          Ablehnen
        </UButton>
      </div>
      <p v-if="isLateCancellation" class="text-xs text-muted mt-2">
        {{ lateCancelTooltip }}
      </p>
    </section>

    <!-- AKTION: Initiator absagen (state-conditional, siehe Original) -->
    <section
      v-if="isInitiator && !result && !['COMPLETED', 'DISPUTED', 'CANCELLED', 'DECLINED'].includes(friendly.status)"
      class="anim anim-3 mb-12"
    >
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Aktionen</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <UTooltip
          v-if="isLateCancellation && (friendly.status === 'PROPOSED' || friendly.status === 'CONFIRMED')"
          :text="lateCancelTooltip"
        >
          <UButton variant="soft" color="error" disabled>Absagen</UButton>
        </UTooltip>
        <UButton
          v-else
          variant="soft"
          color="error"
          icon="i-lucide-x-circle"
          :loading="submitting"
          @click="cancel"
        >
          Absagen
        </UButton>
      </div>
      <p
        v-if="isLateCancellation && (friendly.status === 'PROPOSED' || friendly.status === 'CONFIRMED')"
        class="text-xs text-muted mt-2"
      >
        {{ lateCancelTooltip }}
      </p>
    </section>

    <!-- ERGEBNIS MELDEN: CONFIRMED/PLAYED ohne Result -->
    <section
      v-if="(friendly.status === 'CONFIRMED' || friendly.status === 'PLAYED') && !result"
      class="anim anim-4 mb-12"
    >
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">Nach dem Match</h2>
      </div>
      <p v-if="isInFuture" class="text-sm text-muted italic">
        Match liegt in der Zukunft — Result-Eintrag erst nach dem Termin
        ({{ formatDate(friendly.scheduledAt) }}).
      </p>
      <div v-else-if="!showReport" class="flex flex-wrap gap-2">
        <UButton color="primary" icon="i-lucide-trophy" @click="showReport = true">
          Ergebnis eintragen
        </UButton>
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
        <p class="text-xs text-muted">
          Sätze aus deiner Sicht eintragen — links =
          {{ friendly.format === 'doubles' ? 'dein Team' : 'du' }}.
        </p>
        <div class="flex gap-2 pt-2">
          <UButton
            type="submit"
            color="primary"
            :loading="submitting"
            :disabled="myTeamWon === undefined || Object.keys(setErrors).length > 0"
          >
            Melden
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showReport = false">Abbrechen</UButton>
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
          <template v-for="(mid, i) in result.winnerMemberIds" :key="mid">
            {{ memberName(mid) }}<span v-if="i < result.winnerMemberIds.length - 1">, </span>
          </template>
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

      <div v-if="isInLoserTeam && !showDispute" class="flex flex-wrap gap-2 mt-4">
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
          <UButton type="submit" color="error" :loading="submitting">Widerspruch absenden</UButton>
          <UButton variant="ghost" color="neutral" @click="showDispute = false">Zurück</UButton>
        </div>
      </form>
      <p v-else class="text-sm text-muted italic mt-4">
        Warte auf Bestätigung durch
        {{ friendly.format === 'doubles' ? 'das Verlierer-Team' : 'den Verlierer' }}.
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
          <template v-for="(mid, i) in result.winnerMemberIds" :key="mid">
            {{ memberName(mid) }}<span v-if="i < result.winnerMemberIds.length - 1">, </span>
          </template>
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
