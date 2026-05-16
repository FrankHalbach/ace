<script setup lang="ts">
import type { MemberDto } from '~~/server/modules/members'
import type { SuggestionDto } from '~~/server/modules/suggestions'

const { loggedIn, user } = useUserSession()
const toast = useToast()

const { data: profile } = await useFetch<MemberDto>('/api/members/me', {
  immediate: loggedIn.value,
})

const { data: suggestions, refresh: refreshSuggestions } = await useFetch<SuggestionDto[]>(
  '/api/suggestions',
  { immediate: loggedIn.value, default: () => [] },
)

useHead({ title: 'Start' })

definePageMeta({
  middleware: 'auth',
})

const challenging = ref<number | null>(null)

async function sendChallenge(s: SuggestionDto) {
  if (s.rankingId === null) return
  challenging.value = s.memberId
  try {
    await $fetch('/api/challenges', {
      method: 'POST',
      body: { challengedId: s.memberId, rankingId: s.rankingId },
    })
    toast.add({ title: `Challenge an ${s.firstName} versendet`, color: 'primary' })
    await refreshSuggestions()
  } catch (err: unknown) {
    toast.add({
      title: 'Challenge fehlgeschlagen',
      description: (err as { statusMessage?: string }).statusMessage ?? '',
      color: 'error',
    })
  } finally {
    challenging.value = null
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-2xl">
    <h1 class="text-2xl font-semibold mb-6">
      Willkommen<span v-if="profile">, {{ profile.firstName }}</span>.
    </h1>

    <section v-if="suggestions.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Für dich vorgeschlagen</h2>
      <ul class="divide-y divide-default border border-default rounded-lg overflow-hidden">
        <li v-for="s in suggestions" :key="s.memberId" class="px-4 py-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <NuxtLink :to="`/spieler/${s.memberId}`" class="flex-1 min-w-0 hover:text-primary transition">
              <div class="font-medium">
                {{ s.firstName }} {{ s.lastName }}
                <span class="text-xs text-muted ml-1">· LK {{ s.dtbLk.toFixed(1) }}</span>
              </div>
              <div class="text-xs text-muted">{{ s.reasonText }}</div>
              <div v-if="s.rankingName" class="text-xs text-dimmed">
                Rangliste: {{ s.rankingName }}
              </div>
            </NuxtLink>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="primary"
                :disabled="s.rankingId === null"
                :loading="challenging === s.memberId"
                @click="sendChallenge(s)"
              >
                Challenge
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                :to="`/friendlies/new?opponentId=${s.memberId}`"
              >
                Friendly
              </UButton>
            </div>
          </div>
        </li>
      </ul>
    </section>

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
      <ul class="space-y-2 text-toned">
        <li>· Profilfoto</li>
        <li>· Email-Versand der Match-Vorschläge</li>
        <li>· Trainings­gruppen + Fokus-Spieler-Markierung</li>
      </ul>
    </section>

    <p v-if="user" class="mt-12 text-xs text-dimmed font-mono">
      memberId={{ user.memberId }}
    </p>
  </UContainer>
</template>
