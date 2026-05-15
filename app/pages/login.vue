<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const errorParam = computed(() => (typeof route.query.error === 'string' ? route.query.error : null))

const email = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)

useHead({ title: 'Anmelden' })

const errorMessage = computed(() => {
  if (submitError.value) return submitError.value
  switch (errorParam.value) {
    case 'expired':
      return 'Der Login-Link ist abgelaufen. Bitte erneut anfordern.'
    case 'consumed':
      return 'Dieser Link wurde bereits benutzt. Bitte erneut anfordern.'
    case 'unknown':
      return 'Dieser Link ist ungültig. Bitte erneut anfordern.'
    default:
      return null
  }
})

async function submit() {
  if (!email.value) return
  submitting.value = true
  submitError.value = null
  try {
    await $fetch('/api/auth/request-link', {
      method: 'POST',
      body: { email: email.value },
    })
    await navigateTo(`/login/check-email?email=${encodeURIComponent(email.value)}`)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 429) {
      submitError.value = 'Zu viele Versuche. Bitte in einer Stunde erneut probieren.'
    } else if (status === 400) {
      submitError.value = 'Bitte gib eine gültige Email-Adresse ein.'
    } else {
      submitError.value = 'Unerwarteter Fehler. Bitte später erneut versuchen.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-16 max-w-md">
    <h1 class="text-3xl font-semibold mb-2">Anmelden bei ace</h1>
    <p class="text-muted mb-8">
      Wir schicken dir einen einmaligen Login-Link per Email. Kein Passwort, keine Apps.
    </p>

    <UCard>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Email-Adresse" :error="errorMessage ?? undefined">
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder="max@neureut.de"
            size="lg"
            class="w-full"
            required
          />
        </UFormField>

        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="submitting"
          :disabled="!email"
        >
          Magic-Link senden
        </UButton>
      </form>
    </UCard>

    <p class="text-xs text-muted mt-6">
      Der Link ist 15 Minuten gültig und nur einmal nutzbar. Falls du noch nicht im Verein
      angemeldet bist, wende dich an den Sportwart.
    </p>
  </UContainer>
</template>
