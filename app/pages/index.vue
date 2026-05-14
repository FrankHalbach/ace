<script setup lang="ts">
import type { MemberDto } from '~~/server/modules/members'

const { loggedIn, user } = useUserSession()

// Eigenes Profil laden — sobald die Session bekannt ist
const { data: profile } = await useFetch<MemberDto>('/api/members/me', {
  immediate: loggedIn.value,
})

useHead({ title: 'Start' })

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

definePageMeta({
  middleware: 'auth',
})
</script>

<template>
  <UContainer class="py-8 max-w-2xl">
    <header class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-semibold">
        Willkommen<span v-if="profile">, {{ profile.firstName }}</span>.
      </h1>
      <UButton variant="ghost" color="neutral" @click="logout">Logout</UButton>
    </header>

    <UCard v-if="profile">
      <div class="space-y-2">
        <p class="text-sm text-stone-500">
          Du bist als <strong>{{ profile.roles.join(', ') }}</strong> eingeloggt.
        </p>
        <p>
          <NuxtLink to="/profile" class="text-emerald-700 underline underline-offset-2">
            Mein Profil bearbeiten →
          </NuxtLink>
        </p>
      </div>
    </UCard>

    <section class="mt-8">
      <h2 class="text-lg font-semibold mb-3">In Entwicklung</h2>
      <ul class="space-y-2 text-stone-700">
        <li>· Rangliste</li>
        <li>· Challenges</li>
        <li>· Freundschaftsspiele</li>
        <li>· Match-Vorschläge</li>
      </ul>
    </section>

    <p v-if="user" class="mt-12 text-xs text-stone-400 font-mono">
      memberId={{ user.memberId }}
    </p>
  </UContainer>
</template>
