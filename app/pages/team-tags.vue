<script setup lang="ts">
import type { TeamTagDto } from '~~/server/modules/team-tags'

definePageMeta({ middleware: 'trainer' })
useHead({ title: 'Mannschaften' })

const { user } = useUserSession()
const toast = useToast()

const isAdmin = computed(() => (user.value?.roles ?? []).includes('admin'))

const { data: tags, refresh } = await useFetch<TeamTagDto[]>('/api/team-tags', {
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

// --- Rename ---------------------------------------------------------------

const editingId = ref<string | null>(null)
const editingName = ref('')
const savingId = ref<string | null>(null)

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

// --- Active-Toggle und sortOrder -----------------------------------------

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

// --- Delete (admin-only) --------------------------------------------------

const deletingId = ref<string | null>(null)

async function deleteTag(tag: TeamTagDto) {
  if (!isAdmin.value) return
  if (!confirm(`Mannschaft „${tag.name}" wirklich löschen? Bestehende Zuordnungen werden entfernt.`)) {
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
        class="p-3 border border-default rounded-lg flex items-center gap-3"
        :class="{ 'opacity-60': !tag.active }"
      >
        <!-- Sortier-Zahl, inline editierbar -->
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
          <div v-else class="flex items-center gap-2">
            <span class="font-medium truncate">{{ tag.name }}</span>
            <span
              v-if="!tag.active"
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted"
            >
              archiviert
            </span>
          </div>
        </div>

        <!-- Aktionen -->
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
      </li>
    </ul>
  </UContainer>
</template>
