<script setup lang="ts">
import type {
  AuditAction,
  AuditLogEntryDto,
  AuditLogPageDto,
  AuditSubjectKind,
} from '~~/server/modules/admin'

// Admin + Trainer dürfen lesen (Design-Doc admin §API-Endpoints).
definePageMeta({ middleware: 'trainer' })
useHead({ title: 'Audit-Log' })

const { user } = useUserSession()
const { members } = await useMemberLookup()

// ─── Filter-State ───────────────────────────────────────────────────────

type ZeitraumPreset = '24h' | '7d' | '30d' | 'all'
const zeitraumOptions: { value: ZeitraumPreset; label: string }[] = [
  { value: '24h', label: 'Letzte 24 Std' },
  { value: '7d', label: 'Letzte 7 Tage' },
  { value: '30d', label: 'Letzte 30 Tage' },
  { value: 'all', label: 'Alle' },
]

const actionFilter = ref<AuditAction | 'all'>('all')
const actorFilter = ref<string | 'all'>('all')
const zeitraum = ref<ZeitraumPreset>('30d')

const actionOptions: { value: AuditAction | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle Aktionen' },
  { value: 'member.created', label: 'Mitglied angelegt' },
  { value: 'member.invited', label: 'Eingeladen' },
  { value: 'member.imported', label: 'CSV-Import' },
  { value: 'member.role-changed', label: 'Rollen geändert' },
  { value: 'member.lk-corrected', label: 'LK korrigiert' },
  { value: 'member.deactivated', label: 'Mitglied deaktiviert' },
  { value: 'member.reactivated', label: 'Mitglied reaktiviert' },
  { value: 'member.team-tags-changed', label: 'Mannschafts-Tags' },
  { value: 'team-tag.created', label: 'Mannschaft angelegt' },
  { value: 'team-tag.renamed', label: 'Mannschaft umbenannt' },
  { value: 'team-tag.deleted', label: 'Mannschaft gelöscht' },
  { value: 'result.corrected', label: 'Ergebnis korrigiert' },
  { value: 'result.dispute-decided', label: 'Streitfall entschieden' },
  { value: 'challenge.cancelled-by-trainer', label: 'Forderung storniert' },
  { value: 'friendly.cancelled-by-trainer', label: 'Friendly abgesagt' },
]

const actionLabelMap: Record<AuditAction, string> = Object.fromEntries(
  actionOptions
    .filter((o): o is { value: AuditAction; label: string } => o.value !== 'all')
    .map((o) => [o.value, o.label]),
) as Record<AuditAction, string>

const actorOptions = computed(() => {
  const list = (members.value ?? [])
    .slice()
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'))
    .map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))
  return [{ value: 'all' as const, label: 'Alle Akteure' }, ...list]
})

// ─── Fetch (URL-getriggert) ─────────────────────────────────────────────

const url = computed(() => {
  const params = new URLSearchParams()
  if (actionFilter.value !== 'all') params.set('action', actionFilter.value)
  if (actorFilter.value !== 'all') params.set('actorId', actorFilter.value)
  if (zeitraum.value !== 'all') {
    const days = zeitraum.value === '24h' ? 1 : zeitraum.value === '7d' ? 7 : 30
    params.set('from', new Date(Date.now() - days * 86400000).toISOString())
  }
  params.set('limit', '50')
  return `/api/admin/audit-log?${params.toString()}`
})

const { data: page, status, refresh } = await useFetch<AuditLogPageDto>(url, {
  watch: [url],
})

// Geladene Folge-Seiten an die erste anhängen.
const additionalEntries = ref<AuditLogEntryDto[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)

watch(page, (p) => {
  // Erste Seite (URL-getriggert) → setzt Reset; ggf. additional entries leeren
  additionalEntries.value = []
  nextCursor.value = p?.nextCursor ?? null
})

const entries = computed<AuditLogEntryDto[]>(() => [
  ...(page.value?.entries ?? []),
  ...additionalEntries.value,
])

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const next = await $fetch<AuditLogPageDto>(`${url.value}&cursor=${nextCursor.value}`)
    additionalEntries.value = [...additionalEntries.value, ...next.entries]
    nextCursor.value = next.nextCursor
  } finally {
    loadingMore.value = false
  }
}

// ─── Anzeige-Helfer ─────────────────────────────────────────────────────

const subjectIcon: Record<AuditSubjectKind | 'none', string> = {
  member: 'i-lucide-user-cog',
  'team-tag': 'i-lucide-users',
  challenge: 'i-lucide-swords',
  friendly: 'i-lucide-handshake',
  result: 'i-lucide-trophy',
  none: 'i-lucide-settings-2',
}

function iconFor(e: AuditLogEntryDto): string {
  return subjectIcon[e.subjectKind ?? 'none']
}

const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function relativeTime(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `vor ${hr} Std`
  const days = Math.floor(hr / 24)
  if (days < 7) return `vor ${days} Tagen`
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`
  return dateTimeFmt.format(new Date(d))
}

function absoluteTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d))
}

// ─── Diff-Rendering ─────────────────────────────────────────────────────

const expanded = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`
  if (v instanceof Date) return absoluteTime(v)
  if (typeof v === 'string') {
    // ISO-Date erkennen und formatieren
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try {
        return absoluteTime(v)
      } catch {
        return v
      }
    }
    return v
  }
  if (typeof v === 'boolean') return v ? 'ja' : 'nein'
  if (typeof v === 'number') return String(v)
  return JSON.stringify(v)
}

type DiffRow = { key: string; before: string; after: string }

function diffRows(before: unknown, after: unknown): DiffRow[] {
  // Beide Objekte: pro Key vergleichen, nur differierende anzeigen
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    const rows: DiffRow[] = []
    for (const k of keys) {
      const b = formatValue(before[k])
      const a = formatValue(after[k])
      if (b !== a) rows.push({ key: k, before: b, after: a })
    }
    return rows
  }
  // Einseitig vorhanden — als unbenannter Single-Diff
  if (before == null && after != null) {
    if (isObject(after)) {
      return Object.entries(after).map(([key, value]) => ({
        key,
        before: '—',
        after: formatValue(value),
      }))
    }
    return [{ key: '', before: '—', after: formatValue(after) }]
  }
  if (before != null && after == null) {
    if (isObject(before)) {
      return Object.entries(before).map(([key, value]) => ({
        key,
        before: formatValue(value),
        after: '—',
      }))
    }
    return [{ key: '', before: formatValue(before), after: '—' }]
  }
  return []
}

function hasDetails(e: AuditLogEntryDto): boolean {
  if (e.note) return true
  return diffRows(e.before, e.after).length > 0
}

const totalCount = computed(() => entries.value.length)

// ─── Akteur-Filter beim Klick auf Listen-Eintrag ───────────────────────

function filterByActor(actorId: string) {
  actorFilter.value = actorId
}

const myRole = computed(() => {
  const roles = user.value?.roles ?? []
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('trainer')) return 'trainer'
  return null
})
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <NuxtLink
        to="/admin"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Admin
      </NuxtLink>
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight mt-2">
        Audit-Log
      </h1>
      <p class="text-sm text-muted mt-2">
        Alle administrativen Eingriffe — wer hat wann was geändert.
        <span v-if="myRole === 'trainer'" class="text-dimmed">Trainer-Sicht (Read-only).</span>
      </p>
    </header>

    <!-- FILTER -->
    <section class="anim anim-2 mb-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <USelectMenu
        v-model="actionFilter"
        :items="actionOptions"
        value-key="value"
        size="md"
      />
      <USelectMenu
        v-model="actorFilter"
        :items="actorOptions"
        value-key="value"
        size="md"
        searchable
      />
      <USelectMenu
        v-model="zeitraum"
        :items="zeitraumOptions"
        value-key="value"
        size="md"
      />
    </section>

    <!-- LISTE -->
    <section class="anim anim-3">
      <div class="section-head__wrap mb-3">
        <h2 class="section-head">
          Einträge<span v-if="totalCount > 0"> · {{ totalCount }}{{ nextCursor ? '+' : '' }}</span>
        </h2>
      </div>

      <!-- Loading-Skeleton -->
      <ul v-if="status === 'pending' && entries.length === 0" class="space-y-3">
        <li
          v-for="n in 5"
          :key="n"
          class="flex items-center gap-3 py-3 border-b border-default animate-pulse"
        >
          <div class="size-9 rounded-md bg-elevated shrink-0" />
          <div class="flex-1 space-y-2">
            <div class="h-3 bg-elevated rounded w-3/4" />
            <div class="h-2 bg-elevated rounded w-1/3" />
          </div>
        </li>
      </ul>

      <!-- Empty -->
      <p
        v-else-if="entries.length === 0"
        class="text-sm text-muted italic py-8 text-center"
      >
        Keine Einträge im gewählten Zeitraum.
      </p>

      <!-- Entries -->
      <ul v-else class="divide-y divide-default border-y border-default">
        <li v-for="e in entries" :key="e.id">
          <div
            class="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3 px-1"
            :class="hasDetails(e) ? 'cursor-pointer hover:bg-elevated/40 rounded' : ''"
            @click="hasDetails(e) ? toggleExpand(e.id) : undefined"
          >
            <span class="lead-icon lead-icon--friendly shrink-0 mt-0.5">
              <UIcon :name="iconFor(e)" class="size-[18px]" />
            </span>

            <div class="flex-1 min-w-0">
              <div class="text-[15px] tracking-[-0.005em] truncate">
                <button
                  class="font-semibold hover:text-primary transition-colors"
                  @click.stop="filterByActor(e.actor.id)"
                >
                  {{ e.actor.firstName }} {{ e.actor.lastName }}
                </button>
                <span class="text-muted">·</span>
                <span class="text-default">{{ actionLabelMap[e.action] ?? e.action }}</span>
                <template v-if="e.subjectLabel">
                  <span class="text-muted">·</span>
                  <span class="text-muted truncate">{{ e.subjectLabel }}</span>
                </template>
              </div>
              <div class="text-xs text-muted mt-0.5" :title="absoluteTime(e.createdAt)">
                {{ relativeTime(e.createdAt) }}
              </div>
            </div>

            <UIcon
              v-if="hasDetails(e)"
              :name="expanded.has(e.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="size-4 text-dimmed shrink-0 mt-1"
            />
          </div>

          <!-- Diff-Detail -->
          <div v-if="hasDetails(e) && expanded.has(e.id)" class="pb-4 pl-12 pr-2">
            <p v-if="e.note" class="text-sm text-muted italic mb-3 border-l-2 border-[color:var(--accent)] pl-3">
              {{ e.note }}
            </p>
            <ul
              v-if="diffRows(e.before, e.after).length > 0"
              class="space-y-1 text-xs font-mono"
            >
              <li
                v-for="row in diffRows(e.before, e.after)"
                :key="row.key"
                class="flex flex-wrap items-baseline gap-1.5"
              >
                <span v-if="row.key" class="text-muted">{{ row.key }}:</span>
                <span class="text-muted line-through decoration-[color:var(--danger)] decoration-1">
                  {{ row.before }}
                </span>
                <UIcon name="i-lucide-arrow-right" class="size-3 text-dimmed" />
                <span class="text-default">{{ row.after }}</span>
              </li>
            </ul>
          </div>
        </li>
      </ul>

      <!-- Mehr laden -->
      <div v-if="nextCursor" class="mt-6 text-center">
        <UButton
          variant="soft"
          color="neutral"
          :loading="loadingMore"
          @click="loadMore"
        >
          Mehr laden
        </UButton>
      </div>
    </section>
  </UContainer>
</template>
