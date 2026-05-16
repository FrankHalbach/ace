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

const themeItems = computed<DropdownMenuItem[]>(() => [
  {
    label: 'Hell',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.preference === 'light',
    onUpdateChecked() {
      colorMode.preference = 'light'
    },
  },
  {
    label: 'Dunkel',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.preference === 'dark',
    onUpdateChecked() {
      colorMode.preference = 'dark'
    },
  },
  {
    label: 'System',
    icon: 'i-lucide-monitor',
    type: 'checkbox',
    checked: colorMode.preference === 'system',
    onUpdateChecked() {
      colorMode.preference = 'system'
    },
  },
])

const items = computed<DropdownMenuItem[][]>(() => [
  ...(profile.value
    ? [[{ label: 'Mein Spieler-Profil', icon: 'i-lucide-user-round', to: `/spieler/${profile.value.id}` }]]
    : []),
  [
    {
      label: 'Theme',
      icon: 'i-lucide-palette',
      children: themeItems.value,
    },
  ],
  ...(profile.value?.roles.some((r) => r === 'trainer' || r === 'admin')
    ? [
        [
          { label: 'Trainer-Bereich', icon: 'i-lucide-whistle', to: '/trainer' },
          ...(profile.value.roles.includes('admin')
            ? [{ label: 'Admin-Bereich', icon: 'i-lucide-shield', to: '/admin' }]
            : []),
        ],
      ]
    : []),
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      color: 'error' as const,
      onSelect: () => logout(),
    },
  ],
])
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

    <!-- Header über der Items-Liste: Avatar + Name + Rolle + LK -->
    <template #content-top>
      <div
        v-if="profile"
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
  </UDropdownMenu>
</template>
