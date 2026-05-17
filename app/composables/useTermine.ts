import type { ChallengeDto } from '~~/server/modules/challenges'
import type { FriendlyDetailDto } from '~~/server/modules/friendlies'

/**
 * Reactive Termine-View für die App-Shell. Mehrere Caller (Layout-Right-
 * Rail, Home-Hero-Sub-Text) bekommen dieselbe Datenquelle — Nuxt cached
 * `useFetch` via URL-Key, also ein echter Request pro Browser-Session.
 *
 * Nicht-blocking: weder challenges noch friendlies werden awaited; der
 * Caller rendert sofort mit leeren Arrays und füllt nach, sobald die
 * Server-Responses zurück sind. Damit verschwindet die 5–10s-Pause, die
 * frühere awaited Fetches in der Home-Page verursachten.
 */

export type TermineItem = {
  key: string
  to: string
  primary: string
  scheduledAt: Date
  courtInfo: string | null
}

export type DateChipParts = {
  day: string
  num: string
  mon: string
}

export async function useTermine() {
  const { user, loggedIn } = useUserSession()

  // WICHTIG: alle Nuxt-Composables (useFetch) synchron VOR dem await
  // aufrufen. Nach einem await auf eine User-Composable ist der Nuxt-
  // Instance-Context verloren und nachfolgende useFetch-Calls feuern
  // "composable called outside of setup". Reihenfolge daher:
  //   1. sync useFetch (challenges, friendlies)
  //   2. await useMemberLookup
  //   3. computeds
  const { data: challenges } = useFetch<ChallengeDto[]>('/api/challenges', {
    key: 'termine-challenges',
    immediate: loggedIn.value,
    default: () => [],
  })

  const { data: friendlies } = useFetch<FriendlyDetailDto[]>('/api/friendlies', {
    key: 'termine-friendlies',
    immediate: loggedIn.value,
    default: () => [],
  })

  const { name: memberName } = await useMemberLookup()

  const me = computed(() => user.value?.memberId ?? null)

  function isMineFriendly(f: FriendlyDetailDto): boolean {
    const myId = me.value
    if (myId === null) return false
    return f.initiatorId === myId || f.invitees.some((i) => i.memberId === myId)
  }

  const scheduledItems = computed<TermineItem[]>(() => {
    const now = Date.now()
    const list: TermineItem[] = []
    for (const f of friendlies.value ?? []) {
      if (f.status !== 'CONFIRMED') continue
      if (!isMineFriendly(f)) continue
      const dt = new Date(f.scheduledAt)
      if (dt.getTime() < now) continue
      const opponent = f.invitees.find((i) => i.memberId !== me.value)
      list.push({
        key: `f-conf-${f.id}`,
        to: `/friendlies/${f.id}`,
        primary: opponent
          ? `${f.format === 'singles' ? 'Einzel' : 'Doppel'} gegen ${memberName(opponent.memberId)}`
          : f.format === 'singles' ? 'Einzel-Match' : 'Doppel-Match',
        scheduledAt: dt,
        courtInfo: f.courtInfo ?? null,
      })
    }
    return list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 5)
  })

  const nextMatch = computed<TermineItem | null>(() => scheduledItems.value[0] ?? null)
  const upcomingRest = computed<TermineItem[]>(() => scheduledItems.value.slice(1))

  // challenges + memberName werden auch von Home für die Offen-Liste
  // gebraucht — wir geben sie hier raus, damit der Caller nicht erneut
  // useFetch / useMemberLookup awaiten muss (Nuxt-Context verschwindet
  // sonst nach mehreren User-Composable-Awaits).
  return {
    challenges,
    friendlies,
    scheduledItems,
    nextMatch,
    upcomingRest,
    memberName,
  }
}

/**
 * Kalendertag-Differenz (heute = 0). NICHT (ms-diff / 86400000), das gibt
 * für Matches "heute 18 Uhr" bei aktueller Zeit 14 Uhr eine falsche
 * "morgen"-Anzeige.
 */
export function dayDiff(target: Date): number {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a.getTime() - today.getTime()) / 86400000)
}

/** "heute · 18:00" / "morgen · 17:30" / "in 3 Tagen · 14:00" / "Sa, 24.05 · 14:00" */
export function relativeUpcoming(d: Date): string {
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const diff = dayDiff(d)
  if (diff <= 0) return `heute · ${time}`
  if (diff === 1) return `morgen · ${time}`
  if (diff <= 7) return `in ${diff} Tagen · ${time}`
  const date = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${date} · ${time}`
}

/** Date-Chip-Parts (Wochentag · Tag · Monat) für Hero-Cards. */
export function dateChip(d: Date): DateChipParts {
  return {
    day: d.toLocaleDateString('de-DE', { weekday: 'short' }),
    num: d.toLocaleDateString('de-DE', { day: '2-digit' }),
    mon: d.toLocaleDateString('de-DE', { month: 'short' }),
  }
}
