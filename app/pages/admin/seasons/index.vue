<script setup lang="ts">
import type { SeasonDto } from '~~/server/modules/seasons'

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
})

useHead({ title: 'Saisons' })

const { data: seasons, refresh } = await useFetch<SeasonDto[]>('/api/seasons')
const toast = useToast()

const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)

async function createSeason() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    await $fetch('/api/seasons', {
      method: 'POST',
      body: { name: newName.value.trim() },
    })
    showCreate.value = false
    newName.value = ''
    await refresh()
    toast.add({ title: 'Saison angelegt', color: 'primary' })
  } catch (err: unknown) {
    toast.add({ title: 'Fehler beim Anlegen', description: apiError(err), color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">Saisons</h1>
      <UButton color="primary" @click="showCreate = true">+ Neue Saison</UButton>
    </header>

    <UCard v-if="showCreate" class="mb-6">
      <form class="space-y-4" @submit.prevent="createSeason">
        <UFormField label="Name">
          <UInput
            v-model="newName"
            placeholder="z. B. Sommer 2026"
            size="lg"
            class="w-full"
            autofocus
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="primary" :loading="creating">Anlegen</UButton>
          <UButton variant="ghost" color="neutral" @click="showCreate = false">Abbrechen</UButton>
        </div>
      </form>
    </UCard>

    <p v-if="seasons?.length === 0" class="text-muted italic">
      Noch keine Saisons angelegt.
    </p>

    <div v-else class="space-y-3">
      <NuxtLink
        v-for="s in seasons"
        :key="s.id"
        :to="`/admin/seasons/${s.id}`"
        class="block p-4 border border-default rounded-lg hover:border-primary hover:bg-elevated transition"
      >
        <div class="flex items-center justify-between">
          <div class="font-medium text-lg">{{ s.name }}</div>
          <SeasonStatusBadge :status="s.status" />
        </div>
        <div v-if="s.startedAt" class="text-sm text-muted mt-1">
          gestartet am {{ new Date(s.startedAt).toLocaleDateString('de-DE') }}
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
