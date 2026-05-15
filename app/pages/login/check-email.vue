<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : null))

useHead({ title: 'Email-Bestätigung' })
</script>

<template>
  <UContainer class="py-16 max-w-md">
    <h1 class="text-3xl font-semibold mb-4">Check deine Email</h1>

    <UCard>
      <p class="mb-4">
        Wir haben dir einen Login-Link
        <template v-if="email">
          an <strong class="font-mono text-sm">{{ email }}</strong>
        </template>
        geschickt. Klicke auf den Link in der Mail, um dich anzumelden.
      </p>
      <p class="text-sm text-muted mb-4">
        Der Link ist 15 Minuten gültig und kann nur einmal verwendet werden.
      </p>
      <p class="text-sm text-muted">
        Keine Email bekommen? Schau in den Spam-Ordner oder
        <NuxtLink to="/login" class="text-primary underline underline-offset-2">
          fordere einen neuen Link an
        </NuxtLink>.
      </p>
    </UCard>
  </UContainer>
</template>
