<script setup lang="ts">
import type { MemberAdminDto, Role } from '~~/server/modules/members'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Mitglieder' })

const { user } = useUserSession()
const toast = useToast()

const { data: members, refresh, status } = await useFetch<MemberAdminDto[]>(
  '/api/admin/members',
  { default: () => [] },
)

// --- Filter ---------------------------------------------------------------

type StatusFilter = 'all' | 'aktiv' | 'pausiert' | 'deaktiviert'
type RoleFilter = 'all' | 'player' | 'trainer' | 'admin'

const search = ref('')
const statusFilter = ref<StatusFilter>('all')
const roleFilter = ref<RoleFilter>('all')

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'pausiert', label: 'Pausiert' },
  { value: 'deaktiviert', label: 'Ausgetreten' },
]
const roleOptions: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Alle Rollen' },
  { value: 'admin', label: 'Admin' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'player', label: 'Nur Spieler' },
]

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (members.value ?? []).filter((m) => {
    if (q) {
      const hay = `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (statusFilter.value === 'aktiv' && (m.status !== 'aktiv' || m.deactivatedAt != null)) return false
    if (statusFilter.value === 'pausiert' && m.status !== 'pausiert') return false
    if (statusFilter.value === 'deaktiviert' && m.deactivatedAt == null) return false
    if (roleFilter.value === 'admin' && !m.roles.includes('admin')) return false
    if (roleFilter.value === 'trainer' && !m.roles.includes('trainer')) return false
    if (roleFilter.value === 'player' && m.roles.length !== 1) return false
    return true
  })
})

// --- Rollen-Editor (Modal) ------------------------------------------------

const editingMember = ref<MemberAdminDto | null>(null)
const editingRoles = ref<Set<Role>>(new Set())
const savingRoles = ref(false)

function openRolesEditor(m: MemberAdminDto) {
  editingMember.value = m
  editingRoles.value = new Set(m.roles)
}

function closeRolesEditor() {
  editingMember.value = null
  editingRoles.value = new Set()
}

function toggleRole(role: Role) {
  if (role === 'player') return // Pflichtrolle
  const set = new Set(editingRoles.value)
  if (set.has(role)) set.delete(role)
  else set.add(role)
  editingRoles.value = set
}

const wouldRemoveOwnAdmin = computed(() => {
  if (!editingMember.value || !user.value) return false
  if (editingMember.value.id !== user.value.memberId) return false
  return editingMember.value.roles.includes('admin') && !editingRoles.value.has('admin')
})

async function saveRoles() {
  if (!editingMember.value) return
  const targetId = editingMember.value.id
  // Always include player; sorted for stable output
  const roles: Role[] = ['player']
  if (editingRoles.value.has('trainer')) roles.push('trainer')
  if (editingRoles.value.has('admin')) roles.push('admin')

  savingRoles.value = true
  try {
    await $fetch(`/api/admin/members/${targetId}/roles`, {
      method: 'PATCH',
      body: { roles },
    })
    await refresh()
    closeRolesEditor()
    toast.add({ title: 'Rollen aktualisiert', color: 'primary' })
  } catch (err: unknown) {
    toast.add({
      title: 'Speichern fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    savingRoles.value = false
  }
}

// --- Anzeige-Helpers ------------------------------------------------------

function initials(m: MemberAdminDto): string {
  return `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase() || '·'
}

function statusLabel(m: MemberAdminDto): { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (m.deactivatedAt != null) return { text: 'ausgetreten', tone: 'danger' }
  if (m.status === 'pausiert') return { text: 'pausiert', tone: 'warning' }
  if (m.invitedAt != null && m.firstLoginAt == null) {
    return { text: 'eingeladen', tone: 'neutral' }
  }
  return { text: 'aktiv', tone: 'success' }
}

function roleLabels(m: MemberAdminDto): string {
  const order: Record<Role, number> = { admin: 0, trainer: 1, player: 2 }
  const sorted = [...m.roles].sort((a, b) => order[a] - order[b])
  if (sorted.length === 1) return 'Spieler'
  return sorted
    .filter((r) => r !== 'player' || sorted.length === 1)
    .map((r) => (r === 'admin' ? 'Admin' : r === 'trainer' ? 'Trainer' : 'Spieler'))
    .join(' · ')
}
</script>

<template>
  <UContainer class="py-10 max-w-4xl md:py-14">
    <header class="flex flex-wrap items-end justify-between gap-4 mb-2">
      <div>
        <h1 class="text-2xl font-semibold">Mitglieder</h1>
        <p class="text-muted text-sm mt-1">
          Vereinsweite Mitgliederliste. Rollen vergeben, Status nachvollziehen.
        </p>
      </div>
      <span
        v-if="members && members.length > 0"
        class="mono text-[11px] font-semibold tracking-[0.14em] uppercase text-muted"
      >
        {{ filtered.length }} / {{ members.length }} Mitglieder
      </span>
    </header>

    <!-- Filter -->
    <div class="flex flex-col sm:flex-row gap-2 mb-4 mt-6">
      <UInput
        v-model="search"
        placeholder="Suche nach Name oder E-Mail"
        icon="i-lucide-search"
        size="md"
        class="flex-1"
      />
      <USelectMenu
        v-model="statusFilter"
        :items="statusOptions"
        value-key="value"
        class="w-40"
      />
      <USelectMenu
        v-model="roleFilter"
        :items="roleOptions"
        value-key="value"
        class="w-40"
      />
    </div>

    <!-- Loading -->
    <ul v-if="status === 'pending'" class="space-y-2">
      <li
        v-for="n in 5"
        :key="n"
        class="flex items-center gap-3 p-3 border border-default rounded-lg animate-pulse min-h-[60px]"
      >
        <div class="size-10 rounded-full bg-elevated shrink-0" />
        <div class="flex-1 space-y-2">
          <div class="h-3 bg-elevated rounded w-40" />
          <div class="h-2 bg-elevated rounded w-24" />
        </div>
      </li>
    </ul>

    <!-- Empty -->
    <p
      v-else-if="filtered.length === 0"
      class="text-muted italic text-sm py-8 text-center"
    >
      Keine Mitglieder gefunden.
    </p>

    <!-- Liste -->
    <ul v-else class="space-y-2">
      <li
        v-for="m in filtered"
        :key="m.id"
        class="flex items-center gap-3 p-3 border border-default rounded-lg transition-colors hover:border-primary/30 hover:bg-elevated/40"
        :class="{ 'opacity-60': m.deactivatedAt != null }"
      >
        <UAvatar :alt="`${m.firstName} ${m.lastName}`" :text="initials(m)" size="md" class="shrink-0" />

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 flex-wrap">
            <NuxtLink
              :to="`/spieler/${m.id}`"
              class="font-medium truncate hover:text-primary transition-colors"
            >
              {{ m.firstName }} {{ m.lastName }}
            </NuxtLink>
            <span
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
              :class="{
                'text-[color:var(--success)]': statusLabel(m).tone === 'success',
                'text-[color:var(--warning)]': statusLabel(m).tone === 'warning',
                'text-[color:var(--danger)]': statusLabel(m).tone === 'danger',
                'text-muted': statusLabel(m).tone === 'neutral',
              }"
            >
              {{ statusLabel(m).text }}
            </span>
          </div>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted">
            <span class="truncate">{{ m.email }}</span>
            <span class="text-default/30">·</span>
            <span class="mono tabular-nums text-primary shrink-0">LK {{ m.dtbLk.toFixed(1) }}</span>
            <span class="text-default/30 hidden sm:inline">·</span>
            <span class="shrink-0 hidden sm:inline">{{ roleLabels(m) }}</span>
          </div>
          <!-- Mobile: Rollen unter dem Rest -->
          <div class="sm:hidden mt-0.5 text-xs text-muted">
            {{ roleLabels(m) }}
          </div>
        </div>

        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-shield"
          aria-label="Rollen bearbeiten"
          @click="openRolesEditor(m)"
        />
      </li>
    </ul>

    <!-- Rollen-Editor-Modal -->
    <UModal :open="editingMember != null" @update:open="closeRolesEditor">
      <template #content>
        <div v-if="editingMember" class="p-6">
          <h2 class="text-lg font-semibold mb-1">
            Rollen für {{ editingMember.firstName }} {{ editingMember.lastName }}
          </h2>
          <p class="text-muted text-sm mb-6">
            Rollen sind kombinierbar — eine Person kann gleichzeitig Spieler,
            Trainer und Admin sein. Spieler ist Pflichtrolle.
          </p>

          <div class="space-y-3">
            <label
              class="flex items-center gap-3 p-3 border border-default rounded-md opacity-60 cursor-not-allowed"
            >
              <UCheckbox :model-value="true" disabled />
              <div>
                <div class="font-medium">Spieler</div>
                <div class="text-xs text-muted">
                  Pflichtrolle — sieht Rangliste, kann Challenges annehmen.
                </div>
              </div>
            </label>

            <label
              class="flex items-center gap-3 p-3 border border-default rounded-md cursor-pointer hover:bg-elevated/40 transition-colors"
            >
              <UCheckbox
                :model-value="editingRoles.has('trainer')"
                @update:model-value="toggleRole('trainer')"
              />
              <div>
                <div class="font-medium">Trainer</div>
                <div class="text-xs text-muted">
                  Sieht Streitfaelle, Aktivitaets-Uebersicht, pflegt Mannschaften.
                </div>
              </div>
            </label>

            <label
              class="flex items-center gap-3 p-3 border border-default rounded-md cursor-pointer hover:bg-elevated/40 transition-colors"
            >
              <UCheckbox
                :model-value="editingRoles.has('admin')"
                @update:model-value="toggleRole('admin')"
              />
              <div>
                <div class="font-medium">Admin</div>
                <div class="text-xs text-muted">
                  Vollzugriff — Saisons, Mitglieder, Audit-Log.
                </div>
              </div>
            </label>
          </div>

          <p
            v-if="wouldRemoveOwnAdmin"
            class="mt-4 p-3 rounded-md text-sm border border-[color:var(--warning)] bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
          >
            <UIcon name="i-lucide-triangle-alert" class="inline size-4 mr-1 align-text-bottom" />
            Du entziehst dir gerade selbst die Admin-Rolle. Stelle sicher, dass ein anderer Admin
            aktiv bleibt — sonst sperrt der Server die Aktion (Lock-out-Schutz).
          </p>

          <div class="flex gap-2 mt-6">
            <UButton color="primary" :loading="savingRoles" @click="saveRoles">
              Speichern
            </UButton>
            <UButton variant="ghost" color="neutral" @click="closeRolesEditor">
              Abbrechen
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
