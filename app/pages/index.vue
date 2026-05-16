<script setup lang="ts">
import type { MemberDto } from '~~/server/modules/members'
import type { SuggestionDto, SuggestionReason } from '~~/server/modules/suggestions'

const reasonIcon: Record<SuggestionReason, string> = {
  'inactive-partner': 'i-lucide-clock-3',
  'new-pairing': 'i-lucide-sparkles',
  'similar-strength': 'i-lucide-scale',
}

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
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="text-lg font-semibold">Für dich vorgeschlagen</h2>
        <span class="text-xs text-dimmed tabular-nums">{{ suggestions.length }} / 5</span>
      </div>
      <ul class="divide-y divide-default">
        <li
          v-for="s in suggestions"
          :key="s.memberId"
          class="py-3 transition-colors hover:bg-elevated/40 -mx-2 px-2 rounded"
        >
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <NuxtLink :to="`/spieler/${s.memberId}`" class="flex-1 min-w-0 group">
              <div class="flex items-center gap-2">
                <span class="font-medium group-hover:text-primary transition-colors">
                  {{ s.firstName }} {{ s.lastName }}
                </span>
                <span class="text-[11px] font-mono tabular-nums text-muted ring-1 ring-default rounded px-1.5 py-0.5">
                  LK {{ s.dtbLk.toFixed(1) }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 mt-1 text-xs text-muted">
                <UIcon :name="reasonIcon[s.reason]" class="size-3.5 shrink-0" />
                <span>{{ s.reasonText }}</span>
              </div>
              <div v-if="s.rankingName" class="text-xs text-dimmed mt-0.5 ml-5">
                Rangliste: {{ s.rankingName }}
              </div>
            </NuxtLink>
            <div class="flex gap-2">
              <UButton
                v-if="s.rankingId !== null"
                size="xs"
                color="primary"
                icon="i-lucide-swords"
                :loading="challenging === s.memberId"
                @click="sendChallenge(s)"
              >
                Challenge
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="secondary"
                icon="i-lucide-handshake"
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
