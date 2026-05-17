<script setup lang="ts">
import type { AgeGroupGender, CreateAgeGroupInput, SeasonDetailDto } from '~~/server/modules/seasons'

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
})

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: season, refresh } = await useFetch<SeasonDetailDto>(() => `/api/seasons/${id.value}`)
useHead({ title: () => season.value?.name ?? 'Saison' })

const toast = useToast()
const isPlanned = computed(() => season.value?.status === 'PLANNED')

// --- Saison-Name editieren ---
const editName = ref('')
watchEffect(() => {
  if (season.value) editName.value = season.value.name
})
const savingName = ref(false)
async function saveName() {
  if (!season.value || editName.value === season.value.name) return
  savingName.value = true
  try {
    await $fetch(`/api/seasons/${id.value}`, {
      method: 'PATCH',
      body: { name: editName.value },
    })
    await refresh()
    toast.add({ title: 'Saison aktualisiert', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Speichern fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    savingName.value = false
  }
}

// --- Lifecycle ---
async function transition(action: 'start' | 'close' | 'archive') {
  try {
    await $fetch(`/api/seasons/${id.value}/${action}`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'Status geändert', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Übergang fehlgeschlagen', description: apiError(err), color: 'error' })
  }
}

// --- AgeGroups ---
const showAdd = ref(false)
const newAg = reactive<CreateAgeGroupInput>({
  name: '',
  minAge: null,
  maxAge: null,
  gender: 'm',
  active: true,
})
const adding = ref(false)
async function addAgeGroup() {
  if (!newAg.name.trim()) return
  adding.value = true
  try {
    await $fetch(`/api/seasons/${id.value}/age-groups`, {
      method: 'POST',
      body: { ...newAg, name: newAg.name.trim() },
    })
    showAdd.value = false
    Object.assign(newAg, { name: '', minAge: null, maxAge: null, gender: 'm' as AgeGroupGender, active: true })
    await refresh()
    toast.add({ title: 'Altersgruppe hinzugefügt', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Konnte nicht hinzugefügt werden', description: apiError(err), color: 'error' })
  } finally {
    adding.value = false
  }
}

async function deleteAgeGroup(agId: number) {
  if (!confirm('Diese Altersgruppe wirklich löschen?')) return
  try {
    await $fetch(`/api/age-groups/${agId}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Altersgruppe gelöscht', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Löschen fehlgeschlagen', description: apiError(err), color: 'error' })
  }
}

const genderLabel: Record<AgeGroupGender, string> = {
  m: 'Herren',
  w: 'Damen',
  mixed: 'Gemischt',
}

function ageRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'alle Altersklassen'
  if (min !== null && max === null) return `${min}+`
  if (min === null && max !== null) return `bis ${max}`
  return `${min}–${max}`
}

// --- Saison-Regeln (config) ---
const proSetLength = ref<8 | 9>(8)
const savingProSet = ref(false)
watchEffect(() => {
  if (season.value) {
    const raw = (season.value.config as { proSetLength?: number } | undefined)?.proSetLength
    proSetLength.value = raw === 9 ? 9 : 8
  }
})
async function saveProSetLength(value: 8 | 9) {
  if (!season.value) return
  savingProSet.value = true
  try {
    const mergedConfig = { ...(season.value.config ?? {}), proSetLength: value }
    await $fetch(`/api/seasons/${id.value}`, {
      method: 'PATCH',
      body: { config: mergedConfig },
    })
    await refresh()
    toast.add({ title: 'Saison-Regeln aktualisiert', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Speichern fehlgeschlagen', description: apiError(err), color: 'error' })
  } finally {
    savingProSet.value = false
  }
}
</script>

<template>
  <div v-if="season">
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/seasons" class="text-muted hover:text-default text-sm">
          ← Saisons
        </NuxtLink>
      </div>
      <SeasonStatusBadge :status="season.status" />
    </header>

    <UCard class="mb-6">
      <UFormField label="Name">
        <div class="flex gap-2">
          <UInput
            v-model="editName"
            :disabled="!isPlanned"
            size="lg"
            class="flex-1"
          />
          <UButton
            v-if="isPlanned"
            color="primary"
            :loading="savingName"
            :disabled="editName === season.name"
            @click="saveName"
          >
            Speichern
          </UButton>
        </div>
      </UFormField>
      <p v-if="!isPlanned" class="text-xs text-muted mt-2">
        Name nur im Status „Geplant" änderbar.
      </p>
    </UCard>

    <section class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold">Altersgruppen</h2>
        <UButton
          v-if="isPlanned"
          variant="soft"
          size="sm"
          @click="showAdd = true"
        >
          + Hinzufügen
        </UButton>
      </div>

      <UCard v-if="showAdd" class="mb-4">
        <form class="space-y-3" @submit.prevent="addAgeGroup">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name">
              <UInput v-model="newAg.name" placeholder="z. B. Herren 40, Juniorinnen U15" class="w-full" autofocus />
            </UFormField>
            <UFormField label="Geschlecht">
              <USelect
                v-model="newAg.gender"
                :items="[
                  { label: 'Herren', value: 'm' },
                  { label: 'Damen', value: 'w' },
                  { label: 'Gemischt (Offen)', value: 'mixed' },
                ]"
              />
            </UFormField>
            <UFormField label="Min. Alter">
              <UInput v-model.number="newAg.minAge" type="number" placeholder="leer = keine Grenze" class="w-full" />
            </UFormField>
            <UFormField label="Max. Alter">
              <UInput v-model.number="newAg.maxAge" type="number" placeholder="leer = keine Grenze" class="w-full" />
            </UFormField>
          </div>
          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="adding">Hinzufügen</UButton>
            <UButton variant="ghost" color="neutral" @click="showAdd = false">Abbrechen</UButton>
          </div>
        </form>
      </UCard>

      <p v-if="season.ageGroups.length === 0" class="text-sm text-muted italic">
        Noch keine Altersgruppen.
      </p>

      <ul v-else class="divide-y divide-default border border-default rounded-lg overflow-hidden">
        <li
          v-for="ag in season.ageGroups"
          :key="ag.id"
          class="p-3 flex items-center justify-between"
        >
          <div>
            <div class="font-medium">{{ ag.name }}</div>
            <div class="text-xs text-muted">
              {{ ageRange(ag.minAge, ag.maxAge) }} · {{ genderLabel[ag.gender] }}
              <span v-if="!ag.active" class="ml-1 text-orange-600 dark:text-orange-400">(inaktiv)</span>
            </div>
          </div>
          <UButton
            v-if="isPlanned"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            @click="deleteAgeGroup(ag.id)"
          />
        </li>
      </ul>
    </section>

    <section class="mb-6 border-t border-default pt-6">
      <h2 class="text-lg font-semibold mb-3">Saison-Regeln</h2>
      <UFormField label="Pro-Set-Länge">
        <USelect
          v-model="proSetLength"
          :disabled="!isPlanned || savingProSet"
          :items="[
            { label: '8 Spiele (Tie-Break bei 8:8 → 9:8)', value: 8 },
            { label: '9 Spiele (Tie-Break bei 9:9 → 10:9)', value: 9 },
          ]"
          @update:model-value="(v) => saveProSetLength(Number(v) === 9 ? 9 : 8)"
        />
      </UFormField>
      <p class="text-xs text-muted mt-2">
        Greift in allen Forderungen dieser Saison im Modus „Pro-Set".
        <span v-if="!isPlanned">Nur im Status „Geplant" änderbar.</span>
      </p>
    </section>

    <section class="border-t border-default pt-6">
      <h2 class="text-lg font-semibold mb-3">Saison-Status</h2>

      <div v-if="season.status === 'PLANNED'" class="space-y-2">
        <p class="text-sm text-muted">
          Beim Start werden die Regeln eingefroren — keine Änderungen mehr an Name oder Altersgruppen.
        </p>
        <UButton color="primary" @click="transition('start')">Saison starten →</UButton>
      </div>

      <div v-else-if="season.status === 'ACTIVE'" class="space-y-2">
        <p class="text-sm text-muted">
          Saison ist aktiv. Schließen, wenn die Spielzeit zu Ende ist.
        </p>
        <UButton color="warning" @click="transition('close')">Saison schließen</UButton>
      </div>

      <div v-else-if="season.status === 'CLOSED'" class="space-y-2">
        <p class="text-sm text-muted">
          Saison geschlossen. Beim Archivieren wird sie read-only.
        </p>
        <UButton color="neutral" @click="transition('archive')">Archivieren</UButton>
      </div>

      <p v-else class="text-sm text-muted italic">Saison ist archiviert.</p>
    </section>
  </div>
</template>
