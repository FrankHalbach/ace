<script setup lang="ts">
import type { TeamMemberDto, TeamTagDto, TeamTagId } from '~~/server/modules/team-tags'

definePageMeta({ middleware: 'trainer' })
useHead({ title: 'Mannschaften' })

const { user } = useUserSession()
const toast = useToast()

const isAdmin = computed(() => (user.value?.roles ?? []).includes('admin'))

const { data: tags, refresh } = await useFetch<TeamTagDto[]>('/api/team-tags', {
  default: () => [],
})

// Globaler Spielerpool fuer den Add-Picker. Frischen wir nach jeder Aenderung
// nicht zwingend — die Mitgliederliste ist stabil; ein Refresh am Mount reicht.
const { data: allMembers } = await useFetch<TeamMemberDto[]>('/api/members', {
  default: () => [],
})

// --- Anlegen --------------------------------------------------------------

const showCreate = ref(false)
const newName = ref('')
const newSortOrder = ref<number | null>(null)
const creating = ref(false)

async function createTag() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  try {
    await $fetch('/api/team-tags', {
      method: 'POST',
      body: {
        name,
        ...(newSortOrder.value != null ? { sortOrder: newSortOrder.value } : {}),
      },
    })
    showCreate.value = false
    newName.value = ''
    newSortOrder.value = null
    await refresh()
    toast.add({ title: 'Mannschaft angelegt', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Fehler beim Anlegen', description: apiError(err), color: 'error' })
  } finally {
    creating.value = false
  }
}

// --- Rename / Sort / Active / Delete (unverändert von vorher) -------------

const editingId = ref<string | null>(null)
const editingName = ref('')
const savingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

function startEdit(tag: TeamTagDto) {
  editingId.value = tag.id
  editingName.value = tag.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveEdit(tag: TeamTagDto) {
  const name = editingName.value.trim()
  if (!name || name === tag.name) {
    cancelEdit()
    return
  }
  savingId.value = tag.id
  try {
    await $fetch(`/api/team-tags/${tag.id}`, {
      method: 'PATCH',
      body: { name },
    })
    cancelEdit()
    await refresh()
    toast.add({ title: 'Umbenannt', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Umbenennen fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    savingId.value = null
  }
}

async function toggleActive(tag: TeamTagDto) {
  savingId.value = tag.id
  try {
    await $fetch(`/api/team-tags/${tag.id}`, {
      method: 'PATCH',
      body: { active: !tag.active },
    })
    await refresh()
    toast.add({
      title: tag.active ? 'Archiviert' : 'Wieder aktiv',
      color: 'primary',
    })
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
  } finally {
    savingId.value = null
  }
}

async function updateSortOrder(tag: TeamTagDto, value: number) {
  if (value === tag.sortOrder) return
  savingId.value = tag.id
  try {
    await $fetch(`/api/team-tags/${tag.id}`, {
      method: 'PATCH',
      body: { sortOrder: value },
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
  } finally {
    savingId.value = null
  }
}

async function deleteTag(tag: TeamTagDto) {
  if (!isAdmin.value) return
  if (
    !confirm(
      `Mannschaft „${tag.name}" wirklich löschen? Bestehende Zuordnungen werden entfernt.`,
    )
  ) {
    return
  }
  deletingId.value = tag.id
  try {
    await $fetch(`/api/team-tags/${tag.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Mannschaft gelöscht', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Löschen fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    deletingId.value = null
  }
}

// --- Roster (aufklappbar) -------------------------------------------------

const expanded = ref<Set<string>>(new Set())
const rosterByTag = ref<Record<string, TeamMemberDto[] | null>>({})
const rosterLoading = ref<Set<string>>(new Set())
const rosterMutating = ref<Set<string>>(new Set())
const addPickerByTag = ref<Record<string, string | null>>({})

function isExpanded(tag: TeamTagDto): boolean {
  return expanded.value.has(tag.id)
}

async function toggleExpand(tag: TeamTagDto) {
  if (expanded.value.has(tag.id)) {
    expanded.value.delete(tag.id)
    expanded.value = new Set(expanded.value)
    return
  }
  expanded.value.add(tag.id)
  expanded.value = new Set(expanded.value)
  if (rosterByTag.value[tag.id] === undefined) {
    await loadRoster(tag.id)
  }
}

async function loadRoster(tagId: string) {
  rosterLoading.value.add(tagId)
  rosterLoading.value = new Set(rosterLoading.value)
  try {
    const members = await $fetch<TeamMemberDto[]>(`/api/team-tags/${tagId}/members`)
    rosterByTag.value = { ...rosterByTag.value, [tagId]: members }
  } catch (err: unknown) {
    toast.add({
      title: 'Konnte Mitglieder nicht laden',
      description: apiError(err),
      color: 'error',
    })
    rosterByTag.value = { ...rosterByTag.value, [tagId]: [] }
  } finally {
    rosterLoading.value.delete(tagId)
    rosterLoading.value = new Set(rosterLoading.value)
  }
}

function rosterFor(tag: TeamTagDto): TeamMemberDto[] | null {
  const r = rosterByTag.value[tag.id]
  return r === undefined ? null : r
}

function isRosterLoading(tag: TeamTagDto): boolean {
  return rosterLoading.value.has(tag.id)
}

function isMutating(tag: TeamTagDto): boolean {
  return rosterMutating.value.has(tag.id)
}

/** Spieler, die noch NICHT in dieser Mannschaft sind — fuer den Picker. */
function pickerItems(tag: TeamTagDto) {
  const roster = rosterFor(tag) ?? []
  const assignedIds = new Set(roster.map((m) => m.id))
  return (allMembers.value ?? [])
    .filter((m) => !assignedIds.has(m.id) && m.status === 'aktiv')
    .map((m) => ({
      label: `${m.firstName} ${m.lastName} · LK ${m.dtbLk.toFixed(1)}`,
      value: m.id,
    }))
}

async function addMember(tag: TeamTagDto, memberId: string) {
  rosterMutating.value.add(tag.id)
  rosterMutating.value = new Set(rosterMutating.value)
  try {
    const next = await $fetch<TeamMemberDto[]>(`/api/team-tags/${tag.id}/members`, {
      method: 'POST',
      body: { memberId },
    })
    rosterByTag.value = { ...rosterByTag.value, [tag.id]: next }
    toast.add({ title: 'Spieler hinzugefügt', color: 'primary' })
  } catch (err: unknown) {
    toast.add({
      title: 'Hinzufügen fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    rosterMutating.value.delete(tag.id)
    rosterMutating.value = new Set(rosterMutating.value)
    addPickerByTag.value = { ...addPickerByTag.value, [tag.id]: null }
  }
}

async function removeMember(tag: TeamTagDto, member: TeamMemberDto) {
  rosterMutating.value.add(tag.id)
  rosterMutating.value = new Set(rosterMutating.value)
  try {
    const next = await $fetch<TeamMemberDto[]>(
      `/api/team-tags/${tag.id}/members/${member.id}`,
      { method: 'DELETE' },
    )
    rosterByTag.value = { ...rosterByTag.value, [tag.id]: next }
    toast.add({
      title: `${member.firstName} ${member.lastName} entfernt`,
      color: 'primary',
    })
  } catch (err: unknown) {
    toast.add({
      title: 'Entfernen fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    rosterMutating.value.delete(tag.id)
    rosterMutating.value = new Set(rosterMutating.value)
  }
}

function initials(m: TeamMemberDto): string {
  return `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase() || '·'
}

function onPickerChange(tag: TeamTagDto, value: string | null) {
  if (value) addMember(tag, value)
}
</script>

<template>
  <UContainer class="py-10 max-w-3xl md:py-14">
    <header class="flex items-center justify-between mb-2 gap-3">
      <h1 class="text-2xl font-semibold">Mannschaften</h1>
      <UButton color="primary" :disabled="showCreate" @click="showCreate = true">
        + Neue Mannschaft
      </UButton>
    </header>

    <p class="text-muted text-sm mb-6">
      Mannschafts-Tags sind reine Anzeige-Markierungen am Spieler. Pflege durch
      Admin und Trainer. Archivierte Tags lassen sich nicht mehr neu vergeben,
      bestehende Zuordnungen bleiben aber bestehen.
    </p>

    <UCard v-if="showCreate" class="mb-6">
      <form class="space-y-4" @submit.prevent="createTag">
        <UFormField label="Name" required>
          <UInput
            v-model="newName"
            placeholder="z. B. 1. Herren"
            size="lg"
            class="w-full"
            autofocus
            :maxlength="80"
          />
        </UFormField>
        <UFormField
          label="Sortierung (optional)"
          help="Niedrigere Zahl steht weiter oben. Leer = 0."
        >
          <UInput
            v-model.number="newSortOrder"
            type="number"
            min="0"
            max="9999"
            placeholder="0"
            class="w-32"
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="primary" :loading="creating">Anlegen</UButton>
          <UButton variant="ghost" color="neutral" @click="showCreate = false">
            Abbrechen
          </UButton>
        </div>
      </form>
    </UCard>

    <p v-if="!tags || tags.length === 0" class="text-muted italic">
      Noch keine Mannschaften angelegt.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="tag in tags"
        :key="tag.id"
        class="border border-default rounded-lg overflow-hidden transition-colors"
        :class="{
          'opacity-60': !tag.active,
          'border-primary/30 bg-elevated/30': isExpanded(tag) && tag.active,
        }"
      >
        <!-- ROW: Header (unchanged actions + new expand affordance) -->
        <div class="flex items-center gap-3 p-3">
          <!-- Chevron — clickable expand toggle, separate from row controls -->
          <button
            type="button"
            class="shrink-0 size-9 inline-flex items-center justify-center rounded-md text-muted hover:text-default hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            :aria-label="isExpanded(tag) ? 'Mitglieder einklappen' : 'Mitglieder anzeigen'"
            :aria-expanded="isExpanded(tag)"
            @click="toggleExpand(tag)"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-90': isExpanded(tag) }"
            />
          </button>

          <!-- Sortier-Zahl -->
          <UInput
            :model-value="tag.sortOrder"
            type="number"
            min="0"
            max="9999"
            size="xs"
            class="w-16 shrink-0"
            :disabled="savingId === tag.id"
            @change="(e: Event) => updateSortOrder(tag, Number((e.target as HTMLInputElement).value))"
          />

          <!-- Name (Anzeige oder Edit-Modus) -->
          <div class="flex-1 min-w-0">
            <form
              v-if="editingId === tag.id"
              class="flex items-center gap-2"
              @submit.prevent="saveEdit(tag)"
            >
              <UInput
                v-model="editingName"
                size="sm"
                class="flex-1"
                autofocus
                :maxlength="80"
                :disabled="savingId === tag.id"
                @keyup.escape="cancelEdit"
              />
              <UButton
                type="submit"
                color="primary"
                size="xs"
                :loading="savingId === tag.id"
              >
                OK
              </UButton>
              <UButton variant="ghost" color="neutral" size="xs" @click="cancelEdit">
                Abbrechen
              </UButton>
            </form>
            <button
              v-else
              type="button"
              class="w-full text-left flex items-center gap-2 group focus-visible:outline-none focus-visible:underline"
              @click="toggleExpand(tag)"
            >
              <span class="font-medium truncate group-hover:text-primary transition-colors">
                {{ tag.name }}
              </span>
              <span
                v-if="!tag.active"
                class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted shrink-0"
              >
                archiviert
              </span>
              <span
                v-if="rosterFor(tag)"
                class="mono text-[11px] font-medium tabular-nums text-muted shrink-0"
              >
                · {{ rosterFor(tag)?.length ?? 0 }}
              </span>
            </button>
          </div>

          <!-- Aktionen (unchanged) -->
          <div v-if="editingId !== tag.id" class="flex items-center gap-1 shrink-0">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-pencil"
              aria-label="Umbenennen"
              :disabled="savingId === tag.id"
              @click="startEdit(tag)"
            />
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              :icon="tag.active ? 'i-lucide-archive' : 'i-lucide-archive-restore'"
              :aria-label="tag.active ? 'Archivieren' : 'Reaktivieren'"
              :loading="savingId === tag.id"
              @click="toggleActive(tag)"
            />
            <UButton
              v-if="isAdmin"
              variant="ghost"
              color="error"
              size="xs"
              icon="i-lucide-trash-2"
              aria-label="Löschen"
              :loading="deletingId === tag.id"
              @click="deleteTag(tag)"
            />
          </div>
        </div>

        <!-- PANEL: Roster (animated reveal) -->
        <Transition name="roster">
          <div v-if="isExpanded(tag)" class="border-t border-default bg-elevated/60">
            <!-- Left accent rule + inset content -->
            <div class="relative pl-5 pr-3 py-4 sm:pl-8 sm:pr-4">
              <span
                class="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/60"
                aria-hidden="true"
              />

              <!-- Loading -->
              <div v-if="isRosterLoading(tag)" class="space-y-2">
                <div
                  v-for="n in 3"
                  :key="n"
                  class="flex items-center gap-3 py-2 px-2 rounded-md animate-pulse"
                >
                  <div class="size-9 rounded-full bg-default/60 shrink-0" />
                  <div class="h-3 bg-default/60 rounded w-32" />
                  <div class="ml-auto h-3 bg-default/40 rounded w-12" />
                </div>
              </div>

              <!-- Loaded -->
              <template v-else>
                <!-- Empty state -->
                <p
                  v-if="(rosterFor(tag) ?? []).length === 0"
                  class="text-muted italic text-sm py-2 px-2"
                >
                  Noch keine Spieler in dieser Mannschaft.
                </p>

                <!-- Roster -->
                <ul v-else class="space-y-1">
                  <li
                    v-for="m in rosterFor(tag)"
                    :key="m.id"
                    class="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-default/40 transition-colors min-h-[44px]"
                  >
                    <UAvatar
                      :alt="`${m.firstName} ${m.lastName}`"
                      :text="initials(m)"
                      size="sm"
                      class="shrink-0"
                    />
                    <div class="flex-1 min-w-0 flex items-baseline gap-2">
                      <span class="font-medium truncate">
                        {{ m.firstName }} {{ m.lastName }}
                      </span>
                      <span
                        v-if="m.status === 'pausiert'"
                        class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted shrink-0"
                      >
                        pausiert
                      </span>
                    </div>
                    <span
                      class="mono text-xs font-medium tabular-nums text-primary shrink-0"
                    >
                      LK {{ m.dtbLk.toFixed(1) }}
                    </span>
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="i-lucide-x"
                      :aria-label="`${m.firstName} ${m.lastName} entfernen`"
                      :loading="isMutating(tag)"
                      @click="removeMember(tag, m)"
                    />
                  </li>
                </ul>

                <!-- Add picker (or archive hint) -->
                <div class="mt-3 pt-3 border-t border-default/60">
                  <p
                    v-if="!tag.active"
                    class="mono text-[11px] font-semibold tracking-[0.12em] uppercase text-muted py-2 px-2"
                  >
                    Archiviert · neue Zuweisungen gesperrt
                  </p>
                  <USelectMenu
                    v-else
                    :model-value="addPickerByTag[tag.id] ?? null"
                    :items="pickerItems(tag)"
                    value-key="value"
                    searchable
                    searchable-placeholder="Spieler suchen…"
                    placeholder="+ Spieler hinzufügen"
                    icon="i-lucide-user-plus"
                    class="w-full"
                    :disabled="isMutating(tag)"
                    @update:model-value="(v: string | null) => onPickerChange(tag, v)"
                  />
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </li>
    </ul>
  </UContainer>
</template>

<style scoped>
/* Smooth height + opacity reveal for the roster panel. CSS-only via Vue
   Transition — keeps the interaction tactile without JS measurement. */
.roster-enter-active,
.roster-leave-active {
  transition:
    grid-template-rows 200ms ease,
    opacity 180ms ease;
  display: grid;
  grid-template-rows: 1fr;
}

.roster-enter-from,
.roster-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.roster-enter-active > *,
.roster-leave-active > * {
  overflow: hidden;
}
</style>
