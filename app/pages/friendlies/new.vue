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
const partnerId = ref<string | undefined>(undefined)
const opponentIds = ref<(string | undefined)[]>([undefined])

watch(format, (f) => {
  partnerId.value = undefined
  opponentIds.value = f === 'singles' ? [undefined] : [undefined, undefined]
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
const matchMode = ref<FriendlyMatchMode>('two-sets-match-tiebreak')

const me = computed(() => user.value?.memberId)

const selectableMembers = computed(() =>
  (members.value ?? []).filter((m) => m.id !== me.value && m.status === 'aktiv'),
)

function memberItems(excluded: (string | undefined)[]) {
  const exSet = new Set(excluded.filter((x): x is string => x !== undefined))
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
    return opponentIds.value[0] !== undefined
  }
  return partnerId.value !== undefined && opponentIds.value.every((x) => x !== undefined)
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
    opponentIds: opponentIds.value.filter((x): x is string => x !== undefined),
    ...(format.value === 'doubles' && partnerId.value !== undefined
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
    toast.add({ title: 'Fehler', description: apiError(err), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 max-w-2xl md:max-w-3xl md:py-14">
    <!-- HERO -->
    <header class="anim anim-1 mb-10 md:mb-12">
      <NuxtLink
        to="/friendlies"
        class="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        Freundschaftsspiele
      </NuxtLink>
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight mt-2">
        Spiel anbieten
      </h1>
      <p class="text-sm text-muted mt-2">
        Einzel oder Doppel — Eingeladene bekommen eine E-Mail und können
        an- oder ablehnen.
      </p>
    </header>

    <form class="space-y-12" @submit.prevent="submit">
      <!-- SPIELFORM -->
      <section class="anim anim-2">
        <div class="section-head__wrap mb-4">
          <h2 class="section-head">Spielform</h2>
        </div>

        <UFormField label="Format" class="mb-5">
          <URadioGroup
            v-model="format"
            :items="[
              { label: 'Einzel', value: 'singles' },
              { label: 'Doppel', value: 'doubles' },
            ]"
          />
        </UFormField>

        <UFormField
          v-if="format === 'doubles'"
          label="Mein Partner"
          class="mb-5"
        >
          <USelect
            v-model="partnerId"
            :items="partnerItems"
            placeholder="Partner wählen…"
            class="w-full"
          />
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
      </section>

      <!-- TERMIN -->
      <section class="anim anim-3">
        <div class="section-head__wrap mb-4">
          <h2 class="section-head">Termin</h2>
        </div>

        <UFormField label="Datum & Uhrzeit" class="mb-5">
          <div class="flex gap-2">
            <UInput v-model="scheduledDate" type="date" class="flex-1" />
            <UInput v-model="scheduledTime" type="time" step="1800" class="w-28" />
          </div>
        </UFormField>

        <UFormField label="Platz / Halle (optional)">
          <UInput v-model="courtInfo" placeholder="z. B. Platz 3, Halle 1" class="w-full" />
        </UFormField>
      </section>

      <!-- REGELN -->
      <section class="anim anim-4">
        <div class="section-head__wrap mb-4">
          <h2 class="section-head">Regeln</h2>
        </div>
        <p class="text-sm text-muted leading-relaxed">
          <span class="font-medium text-default">2 Gewinnsätze</span>, bei Satzstand 1:1
          entscheidet ein <span class="font-medium text-default">Match-Tiebreak</span>
          (bis 10, mit 2 Punkten Vorsprung).
        </p>
      </section>

      <!-- NOTIZ -->
      <section class="anim anim-5">
        <div class="section-head__wrap mb-4">
          <h2 class="section-head">Notiz · optional</h2>
        </div>
        <UTextarea
          v-model="note"
          :rows="3"
          :maxlength="500"
          placeholder="z. B. Tennishalle bei Regen, kurzes Match wegen Zeitdruck …"
          class="w-full"
        />
      </section>

      <!-- SUBMIT -->
      <div class="anim anim-5 border-t border-default pt-6">
        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          icon="i-lucide-handshake"
          :loading="submitting"
          :disabled="!canSubmit"
        >
          Einladen
        </UButton>
      </div>
    </form>
  </UContainer>
</template>
