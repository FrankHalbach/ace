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

const rolesLabel = computed(() =>
  profile.value ? profile.value.roles.join(' · ') : '',
)

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
  [
    {
      type: 'label',
      label: displayName.value,
    },
    ...(rolesLabel.value
      ? [{ type: 'label' as const, label: rolesLabel.value, class: 'text-xs text-muted' }]
      : []),
  ],
  [
    ...(profile.value
      ? [{ label: 'Mein Spieler-Profil', icon: 'i-lucide-user-round', to: `/spieler/${profile.value.id}` }]
      : []),
    { label: 'Profil bearbeiten', icon: 'i-lucide-user-cog', to: '/profile' },
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
  <UDropdownMenu :items="items" :ui="{ content: 'w-56' }">
    <UButton
      variant="ghost"
      color="neutral"
      class="rounded-full !p-1"
      :aria-label="`Menü für ${displayName}`"
    >
      <UAvatar :alt="displayName" :text="initials" size="md" />
    </UButton>
  </UDropdownMenu>
</template>
