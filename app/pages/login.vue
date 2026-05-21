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
      return 'Der Anmelde-Link ist abgelaufen. Bitte erneut anfordern.'
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
      submitError.value = 'Bitte gib eine gültige E-Mail-Adresse ein.'
    } else {
      submitError.value = 'Unerwarteter Fehler. Bitte später erneut versuchen.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-16 md:py-24 max-w-md">
    <!-- BRAND -->
    <p class="anim anim-1 mono text-[10px] font-semibold tracking-[0.22em] uppercase text-muted mb-6 inline-flex items-center gap-2">
      <span class="inline-block w-5 h-[2px] bg-[color:var(--accent)]" aria-hidden="true" />
      TuS Neureut · Tennis
    </p>

    <!-- HERO -->
    <header class="anim anim-2 mb-10">
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Anmelden bei <span class="italic text-primary">ace</span>
      </h1>
      <p class="text-sm text-muted mt-3">
        Einmaliger Anmelde-Link per E-Mail. Kein Passwort, keine App.
      </p>
    </header>

    <!-- FORM -->
    <form class="anim anim-3 space-y-5" @submit.prevent="submit">
      <UFormField label="E-Mail-Adresse" :error="errorMessage ?? undefined">
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
        icon="i-lucide-mail"
        :loading="submitting"
        :disabled="!email"
      >
        Anmelde-Link senden
      </UButton>
    </form>

    <!-- FINE PRINT -->
    <p class="anim anim-4 text-xs text-muted mt-10 pt-6 border-t border-default leading-relaxed">
      Der Link ist 15 Minuten gültig und nur einmal nutzbar. Falls du noch nicht im Verein
      registriert bist, wende dich an den Sportwart.
    </p>
  </UContainer>
</template>
