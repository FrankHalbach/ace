<script setup lang="ts">
import type { MemberAdminDto, Role } from '~~/server/modules/members'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Mitglieder' })

const { user } = useUserSession()
const toast = useToast()
const currentYear = new Date().getFullYear()

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

// --- LK-Editor (Modal) ----------------------------------------------------

const editingLkMember = ref<MemberAdminDto | null>(null)
const editingLk = ref<number | null>(null)
const editingLkNote = ref('')
const savingLk = ref(false)

function openLkEditor(m: MemberAdminDto) {
  editingLkMember.value = m
  editingLk.value = m.dtbLk
  editingLkNote.value = ''
}

function closeLkEditor() {
  if (savingLk.value) return
  editingLkMember.value = null
  editingLk.value = null
  editingLkNote.value = ''
}

const lkValid = computed(() => {
  const v = editingLk.value
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 25
})

const lkChanged = computed(
  () => editingLkMember.value != null && editingLk.value !== editingLkMember.value.dtbLk,
)

async function saveLk() {
  if (!editingLkMember.value || !lkValid.value) return
  const targetId = editingLkMember.value.id
  savingLk.value = true
  try {
    await $fetch(`/api/admin/members/${targetId}/lk`, {
      method: 'PATCH',
      body: {
        dtbLk: editingLk.value,
        note: editingLkNote.value.trim() || undefined,
      },
    })
    await refresh()
    toast.add({ title: 'LK aktualisiert', color: 'primary' })
    closeLkEditor()
  } catch (err: unknown) {
    toast.add({
      title: 'LK-Aenderung fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    savingLk.value = false
  }
}

// --- Anlegen --------------------------------------------------------------

type NewMemberForm = {
  firstName: string
  lastName: string
  birthYear: number | null
  gender: 'm' | 'w' | null
  email: string
  dtbLk: number | null
}

function emptyForm(): NewMemberForm {
  return {
    firstName: '',
    lastName: '',
    birthYear: null,
    gender: null,
    email: '',
    dtbLk: null,
  }
}

const showCreate = ref(false)
const newForm = ref<NewMemberForm>(emptyForm())
const creating = ref(false)

const newFormValid = computed(() => {
  const f = newForm.value
  return (
    f.firstName.trim().length > 0 &&
    f.lastName.trim().length > 0 &&
    typeof f.birthYear === 'number' &&
    f.birthYear >= 1920 &&
    f.birthYear <= currentYear &&
    (f.gender === 'm' || f.gender === 'w') &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) &&
    typeof f.dtbLk === 'number' &&
    f.dtbLk >= 1 &&
    f.dtbLk <= 25
  )
})

function openCreate() {
  newForm.value = emptyForm()
  showCreate.value = true
}

function closeCreate() {
  if (creating.value) return
  showCreate.value = false
}

async function submitCreate() {
  if (!newFormValid.value) return
  creating.value = true
  try {
    await $fetch('/api/admin/members', {
      method: 'POST',
      body: {
        firstName: newForm.value.firstName.trim(),
        lastName: newForm.value.lastName.trim(),
        birthYear: newForm.value.birthYear,
        gender: newForm.value.gender,
        email: newForm.value.email.trim().toLowerCase(),
        dtbLk: newForm.value.dtbLk,
      },
    })
    await refresh()
    showCreate.value = false
    toast.add({
      title: `${newForm.value.firstName} ${newForm.value.lastName} angelegt`,
      description: 'Einladungs-Mail folgt im nächsten Schritt.',
      color: 'primary',
    })
  } catch (err: unknown) {
    toast.add({
      title: 'Anlegen fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    creating.value = false
  }
}

const genderOptions: { value: 'm' | 'w'; label: string }[] = [
  { value: 'm', label: 'männlich' },
  { value: 'w', label: 'weiblich' },
]

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
    <header class="flex flex-wrap items-start justify-between gap-4 mb-2">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold">Mitglieder</h1>
        <p class="text-muted text-sm mt-1">
          Vereinsweite Mitgliederliste. Rollen vergeben, Status nachvollziehen.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-upload"
          disabled
          title="folgt — CSV-Import kommt im nächsten Schritt"
        >
          CSV importieren
        </UButton>
        <UButton color="primary" icon="i-lucide-user-plus" @click="openCreate">
          Neues Mitglied
        </UButton>
      </div>
    </header>

    <p
      v-if="members && members.length > 0"
      class="mono text-[11px] font-semibold tracking-[0.14em] uppercase text-muted mt-3"
    >
      {{ filtered.length }} / {{ members.length }} Mitglieder
    </p>

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
          icon="i-lucide-gauge"
          aria-label="LK ändern"
          @click="openLkEditor(m)"
        />
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

    <!-- LK-Editor-Modal -->
    <UModal :open="editingLkMember != null" :ui="{ content: 'max-w-md' }" @update:open="(v: boolean) => !v && closeLkEditor()">
      <template #content>
        <form v-if="editingLkMember" class="p-6" @submit.prevent="saveLk">
          <h2 class="text-lg font-semibold mb-1">
            LK ändern · {{ editingLkMember.firstName }} {{ editingLkMember.lastName }}
          </h2>
          <p class="text-muted text-sm mb-5">
            DTB-LK zwischen 1.0 und 25.0. Die Änderung wird im Audit-Log
            protokolliert; eine optionale Begründung landet dort als Notiz.
          </p>

          <div class="space-y-4">
            <UFormField label="DTB-LK" required help="z. B. 8.3">
              <UInput
                v-model.number="editingLk"
                type="number"
                :min="1"
                :max="25"
                step="0.1"
                size="md"
                class="w-full"
                autofocus
              />
            </UFormField>

            <UFormField label="Begründung (optional)" help="Wird im Audit-Log gespeichert.">
              <UInput
                v-model="editingLkNote"
                size="md"
                class="w-full"
                :maxlength="500"
                placeholder="z. B. DTB-Jahresupdate"
              />
            </UFormField>
          </div>

          <div class="flex gap-2 mt-6 justify-end">
            <UButton variant="ghost" color="neutral" :disabled="savingLk" @click="closeLkEditor">
              Abbrechen
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :disabled="!lkValid || !lkChanged"
              :loading="savingLk"
            >
              Speichern
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Anlage-Modal -->
    <UModal :open="showCreate" :ui="{ content: 'max-w-xl' }" @update:open="(v: boolean) => !v && closeCreate()">
      <template #content>
        <form class="flex flex-col max-h-[85vh]" @submit.prevent="submitCreate">
          <header class="flex items-start justify-between gap-4 p-6 border-b border-default">
            <div class="min-w-0">
              <h2 class="text-lg font-semibold">Neues Mitglied anlegen</h2>
              <p class="text-muted text-sm mt-0.5">
                Pflichtfelder ausfüllen — Einladungs-Mail folgt mit dem nächsten Schritt.
              </p>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              aria-label="Abbrechen"
              :disabled="creating"
              @click="closeCreate"
            />
          </header>

          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Vorname" required>
                <UInput
                  v-model="newForm.firstName"
                  size="md"
                  class="w-full"
                  autocomplete="given-name"
                  autofocus
                  :maxlength="60"
                />
              </UFormField>
              <UFormField label="Nachname" required>
                <UInput
                  v-model="newForm.lastName"
                  size="md"
                  class="w-full"
                  autocomplete="family-name"
                  :maxlength="60"
                />
              </UFormField>
            </div>

            <UFormField label="E-Mail" required help="Wird für Einladungs- und Login-Links verwendet.">
              <UInput
                v-model="newForm.email"
                type="email"
                size="md"
                class="w-full"
                autocomplete="email"
                :maxlength="120"
              />
            </UFormField>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UFormField label="Geburtsjahr" required>
                <UInput
                  v-model.number="newForm.birthYear"
                  type="number"
                  :min="1920"
                  :max="currentYear"
                  size="md"
                  class="w-full"
                  placeholder="z. B. 1990"
                />
              </UFormField>
              <UFormField label="Geschlecht" required>
                <USelectMenu
                  v-model="newForm.gender"
                  :items="genderOptions"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="DTB-LK" required help="1.0–25.0">
                <UInput
                  v-model.number="newForm.dtbLk"
                  type="number"
                  :min="1"
                  :max="25"
                  step="0.1"
                  size="md"
                  class="w-full"
                  placeholder="z. B. 10.5"
                />
              </UFormField>
            </div>

            <p class="text-muted text-xs mt-2">
              Der neue Spieler bekommt automatisch die Rolle <span class="font-medium">Spieler</span>.
              Weitere Rollen (Trainer, Admin) kannst du danach im Rollen-Editor vergeben.
            </p>
          </div>

          <footer class="flex items-center justify-end gap-2 p-4 border-t border-default bg-elevated/30">
            <UButton variant="ghost" color="neutral" size="sm" :disabled="creating" @click="closeCreate">
              Abbrechen
            </UButton>
            <UButton
              type="submit"
              color="primary"
              size="sm"
              :disabled="!newFormValid"
              :loading="creating"
            >
              Anlegen
            </UButton>
          </footer>
        </form>
      </template>
    </UModal>
  </UContainer>
</template>
