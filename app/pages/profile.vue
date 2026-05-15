<script setup lang="ts">
import type { MemberDto, UpdateOwnProfileInput } from '~~/server/modules/members'

definePageMeta({
  middleware: 'auth',
})

useHead({ title: 'Mein Profil' })

const toast = useToast()

const { data: profile, refresh } = await useFetch<MemberDto>('/api/members/me')

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
    seniorsFriendly: false,
  },
})

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

const saving = ref(false)
async function save() {
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
          <UFormField label="Vorname">
            <UInput v-model="form.firstName" size="lg" class="w-full" />
          </UFormField>
          <UFormField label="Nachname">
            <UInput v-model="form.lastName" size="lg" class="w-full" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Geburtsjahr">
            <UInput
              v-model.number="form.birthYear"
              type="number"
              min="1920"
              max="2020"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="DTB-LK">
            <UInput
              v-model.number="form.dtbLk"
              type="number"
              step="0.1"
              min="1"
              max="25"
              size="lg"
              class="w-full"
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
              { label: 'Aktiv — challengebar', value: 'aktiv' },
              { label: 'Pausiert — keine neuen Challenges', value: 'pausiert' },
            ]"
          />
        </UFormField>

        <UFormField label="Spielarten">
          <div class="space-y-2">
            <UCheckbox v-model="form.preferences.singlesChallenges" label="Einzel-Challenges" />
            <UCheckbox v-model="form.preferences.singlesFriendly" label="Einzel-Freundschaftsspiele" />
            <UCheckbox v-model="form.preferences.doublesFriendly" label="Doppel-Freundschaftsspiele" />
            <UCheckbox v-model="form.preferences.mixedFriendly" label="Mixed-Freundschaftsspiele" />
            <UCheckbox v-model="form.preferences.seniorsFriendly" label="Senioren-Freundschaftsspiele" />
          </div>
        </UFormField>

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
