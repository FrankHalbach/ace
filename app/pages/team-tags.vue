<script setup lang="ts">
import type { TeamMemberDto, TeamTagDto } from '~~/server/modules/team-tags'

definePageMeta({ middleware: 'trainer' })
useHead({ title: 'Mannschaften' })

const { user } = useUserSession()
const toast = useToast()

const isAdmin = computed(() => (user.value?.roles ?? []).includes('admin'))

const { data: tags, refresh } = await useFetch<TeamTagDto[]>('/api/team-tags', {
  default: () => [],
})

// Globaler Spielerpool fuer den Add-Picker.
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

// --- Modal-State (Editieren einer einzelnen Mannschaft) -------------------

const editingTag = ref<TeamTagDto | null>(null)
const draftName = ref('')
const draftSortOrder = ref<number>(0)
const draftActive = ref(true)
const savingMeta = ref(false)

const roster = ref<TeamMemberDto[] | null>(null)
const rosterLoading = ref(false)
const rosterMutating = ref(false)
const memberCounts = ref<Record<string, number>>({})

async function openEditor(tag: TeamTagDto) {
  editingTag.value = tag
  draftName.value = tag.name
  draftSortOrder.value = tag.sortOrder
  draftActive.value = tag.active
  roster.value = null
  rosterLoading.value = true
  try {
    const members = await $fetch<TeamMemberDto[]>(`/api/team-tags/${tag.id}/members`)
    roster.value = members
    memberCounts.value = { ...memberCounts.value, [tag.id]: members.length }
  } catch (err: unknown) {
    toast.add({
      title: 'Konnte Mitglieder nicht laden',
      description: apiError(err),
      color: 'error',
    })
    roster.value = []
  } finally {
    rosterLoading.value = false
  }
}

function closeEditor() {
  editingTag.value = null
  roster.value = null
  rosterMutating.value = false
}

const metaDirty = computed(() => {
  const t = editingTag.value
  if (!t) return false
  return (
    draftName.value.trim() !== t.name ||
    draftSortOrder.value !== t.sortOrder ||
    draftActive.value !== t.active
  )
})

async function saveMeta() {
  const tag = editingTag.value
  if (!tag) return
  const name = draftName.value.trim()
  if (!name) return

  const patch: Record<string, unknown> = {}
  if (name !== tag.name) patch.name = name
  if (draftSortOrder.value !== tag.sortOrder) patch.sortOrder = draftSortOrder.value
  if (draftActive.value !== tag.active) patch.active = draftActive.value
  if (Object.keys(patch).length === 0) return

  savingMeta.value = true
  try {
    await $fetch(`/api/team-tags/${tag.id}`, { method: 'PATCH', body: patch })
    await refresh()
    // Update den lokalen editingTag mit neuem Stand, ohne Modal zu schliessen.
    const fresh = (tags.value ?? []).find((t) => t.id === tag.id)
    if (fresh) editingTag.value = fresh
    toast.add({ title: 'Gespeichert', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Speichern fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    savingMeta.value = false
  }
}

// --- Roster-Mutations -----------------------------------------------------

const addPickerValue = ref<string | null>(null)

function pickerItems() {
  const r = roster.value ?? []
  const assignedIds = new Set(r.map((m) => m.id))
  return (allMembers.value ?? [])
    .filter((m) => !assignedIds.has(m.id) && m.status === 'aktiv')
    .map((m) => ({
      label: `${m.firstName} ${m.lastName} · LK ${m.dtbLk.toFixed(1)}`,
      value: m.id,
    }))
}

async function addMember(memberId: string) {
  const tag = editingTag.value
  if (!tag) return
  rosterMutating.value = true
  try {
    const next = await $fetch<TeamMemberDto[]>(`/api/team-tags/${tag.id}/members`, {
      method: 'POST',
      body: { memberId },
    })
    roster.value = next
    memberCounts.value = { ...memberCounts.value, [tag.id]: next.length }
    toast.add({ title: 'Spieler hinzugefügt', color: 'primary' })
  } catch (err: unknown) {
    toast.add({
      title: 'Hinzufügen fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    rosterMutating.value = false
    addPickerValue.value = null
  }
}

async function removeMember(member: TeamMemberDto) {
  const tag = editingTag.value
  if (!tag) return
  rosterMutating.value = true
  try {
    const next = await $fetch<TeamMemberDto[]>(
      `/api/team-tags/${tag.id}/members/${member.id}`,
      { method: 'DELETE' },
    )
    roster.value = next
    memberCounts.value = { ...memberCounts.value, [tag.id]: next.length }
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
    rosterMutating.value = false
  }
}

// --- Loeschen (admin) -----------------------------------------------------

const deleting = ref(false)

async function deleteCurrent() {
  const tag = editingTag.value
  if (!tag || !isAdmin.value) return
  const count = roster.value?.length ?? 0
  const msg =
    count === 0
      ? `Mannschaft „${tag.name}" wirklich löschen?`
      : `Mannschaft „${tag.name}" wirklich löschen? ${count} bestehende Zuordnung${count === 1 ? '' : 'en'} werden entfernt.`
  if (!confirm(msg)) return

  deleting.value = true
  try {
    await $fetch(`/api/team-tags/${tag.id}`, { method: 'DELETE' })
    await refresh()
    closeEditor()
    toast.add({ title: 'Mannschaft gelöscht', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Löschen fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    deleting.value = false
  }
}

// --- Helpers --------------------------------------------------------------

function initials(m: TeamMemberDto): string {
  return `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase() || '·'
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
      Admin und Trainer. Auf eine Zeile klicken, um Spieler zuzuweisen oder die
      Mannschaft zu bearbeiten.
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
      <li v-for="tag in tags" :key="tag.id">
        <button
          type="button"
          class="w-full text-left p-4 border border-default rounded-lg flex items-center gap-4 hover:border-primary/40 hover:bg-elevated/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 min-h-[60px]"
          :class="{ 'opacity-60': !tag.active }"
          @click="openEditor(tag)"
        >
          <!-- Sortier-Badge (kleine Mono-Pille) -->
          <span
            class="shrink-0 mono text-[11px] font-semibold tabular-nums text-muted bg-elevated rounded px-2 py-1"
            aria-label="Sortier-Position"
          >
            {{ tag.sortOrder }}
          </span>

          <div class="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
            <span class="font-medium truncate">{{ tag.name }}</span>
            <span
              v-if="!tag.active"
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted shrink-0"
            >
              archiviert
            </span>
            <span
              v-if="memberCounts[tag.id] !== undefined"
              class="mono text-[11px] font-medium tabular-nums text-muted shrink-0"
            >
              · {{ memberCounts[tag.id] }} Spieler
            </span>
          </div>

          <UIcon name="i-lucide-chevron-right" class="size-5 text-muted shrink-0" />
        </button>
      </li>
    </ul>

    <!-- Modal: Mannschaft editieren -->
    <UModal :open="editingTag != null" :ui="{ content: 'max-w-2xl' }" @update:open="(v: boolean) => !v && closeEditor()">
      <template #content>
        <div v-if="editingTag" class="flex flex-col max-h-[85vh]">
          <!-- Header -->
          <header class="flex items-start justify-between gap-4 p-6 border-b border-default">
            <div class="flex-1 min-w-0">
              <h2 class="text-lg font-semibold truncate">{{ editingTag.name }}</h2>
              <p class="text-muted text-sm mt-0.5">
                Mannschaft bearbeiten und Spieler zuordnen.
              </p>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              aria-label="Schließen"
              @click="closeEditor"
            />
          </header>

          <!-- Body — scroll-area -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <!-- Meta-Felder -->
            <section class="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-3 items-end">
              <UFormField label="Name" required class="min-w-0">
                <UInput v-model="draftName" size="md" class="w-full" :maxlength="80" />
              </UFormField>
              <UFormField label="Sortierung">
                <UInput
                  v-model.number="draftSortOrder"
                  type="number"
                  min="0"
                  max="9999"
                  size="md"
                  class="w-24"
                />
              </UFormField>
              <UFormField label="Aktiv" :help="draftActive ? 'sichtbar' : 'archiviert'">
                <USwitch v-model="draftActive" size="md" class="mt-1" />
              </UFormField>
            </section>

            <div v-if="metaDirty" class="flex justify-end -mt-2">
              <UButton color="primary" size="sm" :loading="savingMeta" @click="saveMeta">
                Änderungen speichern
              </UButton>
            </div>

            <!-- Mitglieder -->
            <section>
              <div class="flex items-baseline justify-between mb-3">
                <h3 class="text-sm font-semibold tracking-[0.04em]">Spieler</h3>
                <span
                  v-if="roster"
                  class="mono text-[11px] font-medium tabular-nums text-muted"
                >
                  {{ roster.length }} im Team
                </span>
              </div>

              <!-- Loading -->
              <div v-if="rosterLoading" class="space-y-2">
                <div
                  v-for="n in 3"
                  :key="n"
                  class="flex items-center gap-3 py-2 px-3 rounded-md animate-pulse bg-elevated/40"
                >
                  <div class="size-9 rounded-full bg-elevated shrink-0" />
                  <div class="h-3 bg-elevated rounded w-32" />
                  <div class="ml-auto h-3 bg-elevated rounded w-12" />
                </div>
              </div>

              <template v-else>
                <!-- Empty -->
                <p
                  v-if="(roster ?? []).length === 0"
                  class="text-muted italic text-sm py-3 px-2 border-l-2 border-default"
                >
                  Noch keine Spieler in dieser Mannschaft.
                </p>

                <!-- Roster -->
                <ul v-else class="space-y-1">
                  <li
                    v-for="m in roster"
                    :key="m.id"
                    class="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-elevated/50 transition-colors min-h-[44px] group"
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
                    <span class="mono text-xs font-medium tabular-nums text-primary shrink-0">
                      LK {{ m.dtbLk.toFixed(1) }}
                    </span>
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="i-lucide-x"
                      :aria-label="`${m.firstName} ${m.lastName} entfernen`"
                      :loading="rosterMutating"
                      class="opacity-50 group-hover:opacity-100 transition-opacity"
                      @click="removeMember(m)"
                    />
                  </li>
                </ul>

                <!-- Add-Picker -->
                <div class="mt-4 pt-4 border-t border-default">
                  <p
                    v-if="!editingTag.active"
                    class="mono text-[11px] font-semibold tracking-[0.12em] uppercase text-muted py-2 px-2"
                  >
                    Archiviert · neue Zuweisungen gesperrt
                  </p>
                  <USelectMenu
                    v-else
                    v-model="addPickerValue"
                    :items="pickerItems()"
                    value-key="value"
                    searchable
                    searchable-placeholder="Spieler suchen…"
                    placeholder="+ Spieler hinzufügen"
                    icon="i-lucide-user-plus"
                    class="w-full"
                    :disabled="rosterMutating"
                    @update:model-value="(v: string | null) => v && addMember(v)"
                  />
                </div>
              </template>
            </section>
          </div>

          <!-- Footer -->
          <footer class="flex items-center justify-between gap-3 p-4 border-t border-default bg-elevated/30">
            <UButton
              v-if="isAdmin"
              variant="ghost"
              color="error"
              size="sm"
              icon="i-lucide-trash-2"
              :loading="deleting"
              @click="deleteCurrent"
            >
              Mannschaft löschen
            </UButton>
            <span v-else />
            <UButton variant="solid" color="neutral" size="sm" @click="closeEditor">
              Fertig
            </UButton>
          </footer>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
