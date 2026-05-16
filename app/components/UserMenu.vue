<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemberDto } from '~~/server/modules/members'

const { user } = useUserSession()
const colorMode = useColorMode()

// Profil holen, sobald Session bekannt ist — gibt uns den Anzeigenamen.
const { data: profile } = await useFetch<MemberDto>('/api/members/me', {
  immediate: !!user.value,
})

const initials = computed(() => {
  const p = profile.value
  if (!p) return '·'
  const a = p.firstName?.[0] ?? ''
  const b = p.lastName?.[0] ?? ''
  return (a + b).toUpperCase() || '·'
})

const displayName = computed(() => {
  const p = profile.value
  return p ? `${p.firstName} ${p.lastName}` : 'Mein Konto'
})

// Rolle für den Dropdown-Header: priorisiert admin > trainer > spieler,
// damit das Label kompakt bleibt und die höchste Rolle zuerst zeigt.
const primaryRole = computed(() => {
  const roles = profile.value?.roles ?? []
  if (roles.includes('admin')) return 'Admin'
  if (roles.includes('trainer')) return 'Trainer'
  if (roles.length > 0) return 'Spieler'
  return ''
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

type ThemePref = 'light' | 'dark' | 'system'
const themeOptions: { value: ThemePref; icon: string; label: string }[] = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Hell' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Dunkel' },
  { value: 'system', icon: 'i-lucide-monitor', label: 'System (Gerät folgen)' },
]

// Top-level Items: "Mein Profil" plus optionale Rollen-Bereiche. Theme und
// Logout liegen als kompakter Footer im content-bottom-Slot.
const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [{ label: 'Mein Profil', icon: 'i-lucide-user-round', to: '/profile' }],
  ]
  const roleGroup: DropdownMenuItem[] = []
  if (profile.value?.roles.includes('trainer') || profile.value?.roles.includes('admin')) {
    roleGroup.push({ label: 'Trainer-Bereich', icon: 'i-lucide-whistle', to: '/trainer' })
  }
  if (profile.value?.roles.includes('admin')) {
    roleGroup.push({ label: 'Admin-Bereich', icon: 'i-lucide-shield', to: '/admin' })
  }
  if (roleGroup.length > 0) groups.push(roleGroup)
  return groups
})
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'w-64' }">
    <UButton
      variant="ghost"
      color="neutral"
      class="rounded-full !p-0.5 !pr-2 gap-1.5 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="`Menü für ${displayName}`"
    >
      <UAvatar :alt="displayName" :text="initials" size="md" />
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3.5 text-muted shrink-0"
        aria-hidden="true"
      />
    </UButton>

    <!-- Header: nur im Haupt-Menü, NICHT in Sub-Menüs (Nuxt UI proxiert
         content-slots in alle Children-Dropdowns — daher das v-if). -->
    <template #content-top="{ sub }">
      <div
        v-if="profile && !sub"
        class="flex items-center gap-3 px-2 py-2.5 mb-1 border-b border-default"
      >
        <UAvatar :alt="displayName" :text="initials" size="md" />
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-sm truncate leading-tight">
            {{ displayName }}
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span
              v-if="primaryRole"
              class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted leading-none"
            >
              {{ primaryRole }}
            </span>
            <span
              v-if="primaryRole"
              class="inline-block size-1 rounded-full bg-[color:var(--rule)]"
              aria-hidden="true"
            />
            <span
              class="mono inline-flex items-center text-[11px] font-medium tabular-nums text-primary leading-none"
            >
              LK {{ profile.dtbLk.toFixed(1) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Footer: Theme-Switcher (Segmented Control) + Logout — nur im
         Haupt-Menü rendern. -->
    <template #content-bottom="{ sub }">
      <div v-if="!sub">
        <div class="border-t border-default mx-1 my-1" />

        <div class="flex items-center justify-between gap-3 px-2 py-1.5">
          <span class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted leading-none">
            Darstellung
          </span>
          <div
            role="radiogroup"
            aria-label="Farbmodus"
            class="inline-flex items-center gap-0.5 rounded-md bg-elevated/60 p-0.5"
          >
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              type="button"
              role="radio"
              :aria-checked="colorMode.preference === opt.value"
              :aria-label="opt.label"
              :title="opt.label"
              class="size-7 inline-flex items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              :class="colorMode.preference === opt.value
                ? 'bg-default text-primary shadow-sm'
                : 'text-muted hover:text-default hover:bg-default/70'"
              @click="colorMode.preference = opt.value"
            >
              <UIcon :name="opt.icon" class="size-3.5" />
            </button>
          </div>
        </div>

        <div class="border-t border-default mx-1 my-1" />

        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md text-error hover:bg-error/10 transition-colors focus-visible:outline-none focus-visible:bg-error/10"
          @click="logout"
        >
          <UIcon name="i-lucide-log-out" class="size-4 shrink-0" />
          Abmelden
        </button>
      </div>
    </template>
  </UDropdownMenu>
</template>
