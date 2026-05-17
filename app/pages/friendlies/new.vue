<script setup lang="ts">
import type { CreateFriendlyInput, FriendlyMatchMode } from '~~/server/modules/friendlies'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Freundschaftsspiel anbieten' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useUserSession()

type MemberRow = {
  id: string
  firstName: string
  lastName: string
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
}

const { data: members } = await useFetch<MemberRow[]>('/api/members', { default: () => [] })

const format = ref<'singles' | 'doubles'>('singles')
const partnerId = ref<string | null>(null)
const opponentIds = ref<(string | null)[]>([null])

watch(format, (f) => {
  partnerId.value = null
  opponentIds.value = f === 'singles' ? [null] : [null, null]
})

// Vorausgewählter Gegner aus Query — z. B. via „Freundschaftsspiel anbieten"-Button
onMounted(() => {
  const pre = route.query.opponentId
  if (typeof pre === 'string' && pre.length > 0) opponentIds.value = [pre]
})

const today = new Date()
const defaultScheduled = new Date(today.getTime() + 24 * 60 * 60 * 1000)
defaultScheduled.setMinutes(0, 0, 0)
defaultScheduled.setHours(18)

const scheduledDate = ref(toDateInput(defaultScheduled))
const scheduledTime = ref(toTimeInput(defaultScheduled))
const courtInfo = ref('')

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const note = ref('')
const matchMode = ref<FriendlyMatchMode>('best-of-3-champions')

const me = computed(() => user.value?.memberId)

const selectableMembers = computed(() =>
  (members.value ?? []).filter((m) => m.id !== me.value && m.status === 'aktiv'),
)

function memberItems(excluded: (string | null)[]) {
  const exSet = new Set(excluded.filter((x): x is string => x !== null))
  return selectableMembers.value
    .filter((m) => !exSet.has(m.id))
    .map((m) => ({ label: `${m.firstName} ${m.lastName} · LK ${m.dtbLk.toFixed(1)}`, value: m.id }))
}

const opponentItems = computed(() =>
  opponentIds.value.map((_, i) => {
    const others = [
      partnerId.value,
      ...opponentIds.value.filter((_, j) => j !== i),
    ]
    return memberItems(others)
  }),
)

const partnerItems = computed(() =>
  memberItems([...opponentIds.value]),
)

const submitting = ref(false)

const canSubmit = computed(() => {
  if (format.value === 'singles') {
    return opponentIds.value[0] !== null
  }
  return partnerId.value !== null && opponentIds.value.every((x) => x !== null)
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  const body: CreateFriendlyInput = {
    format: format.value,
    scheduledAt: new Date(`${scheduledDate.value}T${scheduledTime.value}`),
    courtInfo: courtInfo.value || undefined,
    note: note.value || undefined,
    matchMode: matchMode.value,
    opponentIds: opponentIds.value.filter((x): x is string => x !== null),
    ...(format.value === 'doubles' && partnerId.value !== null
      ? { partnerId: partnerId.value }
      : {}),
  }
  try {
    const created = await $fetch<{ id: string }>('/api/friendlies', {
      method: 'POST',
      body,
    })
    toast.add({ title: 'Eingeladen — Eingeladene erhalten eine E-Mail', color: 'primary' })
    await router.push(`/friendlies/${created.id}`)
  } catch (err: unknown) {
    toast.add({
      title: 'Fehler',
      description: (err as { statusMessage?: string }).statusMessage ?? 'Unbekannter Fehler',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-6 max-w-xl">
    <header class="mb-6">
      <NuxtLink to="/friendlies" class="text-sm text-muted hover:text-default">
        ← Freundschaftsspiele
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">Freundschaftsspiel anbieten</h1>
    </header>

    <UCard>
      <form class="space-y-5" @submit.prevent="submit">
        <UFormField label="Format">
          <URadioGroup
            v-model="format"
            :items="[
              { label: 'Einzel', value: 'singles' },
              { label: 'Doppel', value: 'doubles' },
            ]"
          />
        </UFormField>

        <UFormField v-if="format === 'doubles'" label="Mein Partner">
          <USelect v-model="partnerId" :items="partnerItems" placeholder="Partner wählen…" class="w-full" />
        </UFormField>

        <UFormField :label="format === 'singles' ? 'Gegner' : 'Gegner-Team'">
          <div class="space-y-2">
            <USelect
              v-for="(_, i) in opponentIds"
              :key="i"
              v-model="opponentIds[i]"
              :items="opponentItems[i]"
              :placeholder="`Gegner ${i + 1} wählen…`"
              class="w-full"
            />
          </div>
        </UFormField>

        <UFormField label="Termin">
          <div class="flex gap-2">
            <UInput v-model="scheduledDate" type="date" class="flex-1" />
            <UInput v-model="scheduledTime" type="time" step="1800" class="w-28" />
          </div>
        </UFormField>

        <UFormField label="Platz / Halle (optional)">
          <UInput v-model="courtInfo" placeholder="z. B. Platz 3, Halle 1" class="w-full" />
        </UFormField>

        <UFormField label="Match-Modus">
          <USelect
            v-model="matchMode"
            :items="[
              { label: '2 Sätze + Match-Tiebreak', value: 'two-sets-match-tiebreak' },
              { label: 'Best-of-3 mit Champions-Tiebreak', value: 'best-of-3-champions' },
              { label: 'Best-of-3 mit echtem 3. Satz', value: 'best-of-3-full' },
              { label: 'Best-of-3 mit Match-Tiebreak (Standard)', value: 'best-of-3-tiebreak' },
              { label: 'Kurzsätze (4 Spiele) + Match-Tiebreak', value: 'short-sets-tiebreak' },
              { label: 'Pro Set', value: 'pro-set' },
            ]"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Notiz (optional, max. 500 Zeichen)">
          <UTextarea v-model="note" :rows="2" :maxlength="500" class="w-full" />
        </UFormField>

        <UButton type="submit" color="primary" size="lg" block :loading="submitting" :disabled="!canSubmit">
          Einladen
        </UButton>
      </form>
    </UCard>
  </UContainer>
</template>
