/**
 * Lädt einmal /api/members und stellt eine Lookup-Funktion bereit, die zu
 * einer MemberId den vollen Namen liefert. Sehr dünner Wrapper über useFetch
 * — der Cache passiert über Nuxts Request-Deduplizierung am Key.
 *
 * Verwendung:
 *
 *   const { name, isReady } = await useMemberLookup()
 *   ...
 *   {{ name(memberId) }}     // "Max Müller", oder "#42" wenn unbekannt
 */
type MemberRow = {
  id: number
  firstName: string
  lastName: string
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
}

export async function useMemberLookup() {
  const { data: members, refresh } = await useFetch<MemberRow[]>('/api/members', {
    key: 'members-lookup',
    default: () => [],
  })

  const byId = computed(() => {
    const map = new Map<number, MemberRow>()
    for (const m of members.value ?? []) map.set(m.id, m)
    return map
  })

  function name(id: number | null | undefined): string {
    if (id == null) return '—'
    const m = byId.value.get(id)
    return m ? `${m.firstName} ${m.lastName}` : `#${id}`
  }

  function short(id: number | null | undefined): string {
    if (id == null) return '—'
    const m = byId.value.get(id)
    return m ? `${m.firstName} ${m.lastName.charAt(0)}.` : `#${id}`
  }

  return { members, byId, name, short, isReady: computed(() => byId.value.size > 0), refresh }
}
