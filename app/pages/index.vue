<script setup lang="ts">
import type { MemberDto } from '~~/server/modules/members'

const { loggedIn, user } = useUserSession()

const { data: profile } = await useFetch<MemberDto>('/api/members/me', {
  immediate: loggedIn.value,
})

useHead({ title: 'Start' })

definePageMeta({
  middleware: 'auth',
})
</script>

<template>
  <UContainer class="py-8 max-w-2xl">
    <h1 class="text-2xl font-semibold mb-6">
      Willkommen<span v-if="profile">, {{ profile.firstName }}</span>.
    </h1>

    <UCard v-if="profile">
      <div class="space-y-2">
        <p>
          <NuxtLink to="/ranglisten" class="text-primary underline underline-offset-2">
            Ranglisten →
          </NuxtLink>
        </p>
        <p>
          <NuxtLink to="/challenges" class="text-primary underline underline-offset-2">
            Meine Challenges →
          </NuxtLink>
        </p>
        <p>
          <NuxtLink to="/friendlies" class="text-primary underline underline-offset-2">
            Freundschaftsspiele →
          </NuxtLink>
        </p>
      </div>
    </UCard>

    <section class="mt-8">
      <h2 class="text-lg font-semibold mb-3">In Entwicklung</h2>
      <ul class="space-y-2 text-stone-700 dark:text-stone-300">
        <li>· Profilfoto</li>
        <li>· Match-Vorschläge</li>
        <li>· Trainer-Aktivitätsbericht</li>
        <li>· Streitfall-Resolve-UI für Trainer</li>
      </ul>
    </section>

    <p v-if="user" class="mt-12 text-xs text-stone-400 font-mono">
      memberId={{ user.memberId }}
    </p>
  </UContainer>
</template>
