<script setup lang="ts">
import { z } from 'zod'
import type { MemberDto, UpdateOwnProfileInput } from '~~/server/modules/members'

definePageMeta({
  middleware: 'auth',
})

useHead({ title: 'Mein Profil' })

const toast = useToast()

const { data: profile, refresh } = await useFetch<MemberDto>('/api/members/me')

// Spiegelt das Server-Schema in server/modules/members/types.ts. Bewusst
// dupliziert: der Server-Import würde Drizzle in den Client-Bundle ziehen.
const CURRENT_YEAR = new Date().getFullYear()
const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Vorname fehlt').max(60, 'max. 60 Zeichen'),
  lastName: z.string().trim().min(1, 'Nachname fehlt').max(60, 'max. 60 Zeichen'),
  birthYear: z
    .number({ message: 'Geburtsjahr fehlt' })
    .int('ganze Zahl')
    .gte(1920, 'frühestens 1920')
    .lte(CURRENT_YEAR, `spätestens ${CURRENT_YEAR}`),
  dtbLk: z
    .number({ message: 'LK fehlt' })
    .min(1, 'LK 1 ist das Minimum')
    .max(25, 'LK 25 ist das Maximum'),
})
type ValidatedField = keyof z.infer<typeof profileSchema>

// Reactive lokales Modell. Bei jedem Reload des Profils wieder synchronisieren.
const form = reactive<Required<UpdateOwnProfileInput>>({
  firstName: '',
  lastName: '',
  birthYear: 1990,
  gender: 'm',
  dtbLk: 25,
  status: 'aktiv',
  preferences: {
    singlesChallenges: true,
    singlesFriendly: true,
    doublesFriendly: false,
    mixedFriendly: false,
    ageGroupFriendly: false,
  },
})

const errors = reactive<Partial<Record<ValidatedField, string>>>({})

watchEffect(() => {
  if (profile.value) {
    Object.assign(form, {
      firstName: profile.value.firstName,
      lastName: profile.value.lastName,
      birthYear: profile.value.birthYear,
      gender: profile.value.gender,
      dtbLk: profile.value.dtbLk,
      status: profile.value.status,
      preferences: { ...profile.value.preferences },
    })
  }
})

function validate(): boolean {
  for (const key of ['firstName', 'lastName', 'birthYear', 'dtbLk'] as ValidatedField[]) {
    delete errors[key]
  }
  const result = profileSchema.safeParse({
    firstName: form.firstName,
    lastName: form.lastName,
    birthYear: form.birthYear,
    dtbLk: form.dtbLk,
  })
  if (result.success) return true
  for (const issue of result.error.issues) {
    const key = issue.path[0] as ValidatedField | undefined
    if (key && !errors[key]) errors[key] = issue.message
  }
  return false
}

function validateField(field: ValidatedField): void {
  const result = profileSchema.shape[field].safeParse(form[field])
  if (result.success) delete errors[field]
  else errors[field] = result.error.issues[0]?.message ?? 'Ungültig'
}

const saving = ref(false)
async function save() {
  if (!validate()) {
    toast.add({ title: 'Bitte Eingaben prüfen', color: 'warning' })
    return
  }
  saving.value = true
  try {
    await $fetch('/api/members/me', {
      method: 'PATCH',
      body: form,
    })
    toast.add({ title: 'Profil aktualisiert', color: 'primary' })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Speichern fehlgeschlagen',
      description: (err as { statusMessage?: string }).statusMessage ?? 'Unbekannter Fehler',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-semibold mb-6">Mein Profil</h1>

    <UCard v-if="profile">
      <form class="space-y-6" @submit.prevent="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Vorname" :error="errors.firstName">
            <UInput
              v-model="form.firstName"
              size="lg"
              class="w-full"
              @blur="validateField('firstName')"
            />
          </UFormField>
          <UFormField label="Nachname" :error="errors.lastName">
            <UInput
              v-model="form.lastName"
              size="lg"
              class="w-full"
              @blur="validateField('lastName')"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Geburtsjahr" :error="errors.birthYear">
            <UInput
              v-model.number="form.birthYear"
              type="number"
              min="1920"
              :max="new Date().getFullYear()"
              size="lg"
              class="w-full"
              @blur="validateField('birthYear')"
            />
          </UFormField>
          <UFormField label="DTB-LK" :error="errors.dtbLk">
            <UInput
              v-model.number="form.dtbLk"
              type="number"
              step="0.1"
              min="1"
              max="25"
              size="lg"
              class="w-full"
              @blur="validateField('dtbLk')"
            />
          </UFormField>
        </div>

        <UFormField label="Geschlecht">
          <URadioGroup
            v-model="form.gender"
            :items="[
              { label: 'Männlich', value: 'm' },
              { label: 'Weiblich', value: 'w' },
            ]"
          />
        </UFormField>

        <UFormField label="Status">
          <URadioGroup
            v-model="form.status"
            :items="[
              { label: 'Aktiv — forderbar', value: 'aktiv' },
              { label: 'Pausiert — keine neuen Forderungen', value: 'pausiert' },
            ]"
          />
        </UFormField>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-default mb-2">Spielarten</legend>
          <UCheckbox v-model="form.preferences.singlesChallenges" label="Einzel-Forderungen" />
          <UCheckbox v-model="form.preferences.singlesFriendly" label="Einzel-Freundschaftsspiele" />
          <UCheckbox v-model="form.preferences.doublesFriendly" label="Doppel-Freundschaftsspiele" />
          <UCheckbox v-model="form.preferences.mixedFriendly" label="Mixed-Freundschaftsspiele" />
          <UCheckbox v-model="form.preferences.ageGroupFriendly" label="Altersklassen-Freundschaftsspiele" />
        </fieldset>

        <UButton type="submit" color="primary" size="lg" block :loading="saving">
          Speichern
        </UButton>
      </form>
    </UCard>

    <p v-if="profile" class="text-xs text-dimmed mt-6 font-mono">
      {{ profile.email }} · LK {{ profile.dtbLk.toFixed(1) }}
    </p>
  </UContainer>
</template>
