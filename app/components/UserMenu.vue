<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemberDto } from '~~/server/modules/members'

/**
 * `variant = 'expanded'` rendert die Trigger-Fläche als breiten Profil-Row
 * (Avatar + Name + Rolle + LK), passend für den Desktop-Drawer-Fuß. Default
 * bleibt die kompakte Avatar-Pille für die Mobile-Topbar.
 */
const props = withDefaults(defineProps<{ variant?: 'compact' | 'expanded' }>(), {
  variant: 'compact',
})

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

const isAdmin = computed(() => (profile.value?.roles ?? []).includes('admin'))
const isStaff = computed(() => {
  const r = profile.value?.roles ?? []
  return r.includes('trainer') || r.includes('admin')
})

// Top-level Items: "Mein Profil" immer; Trainer-/Admin-Bereich nur in der
// kompakten Variante (Mobile-Topbar) — auf Desktop trägt der Drawer diese
// Einträge bereits sichtbar im "Bereich"-Block, dort wäre doppelt redundant.
const items = computed<DropdownMenuItem[][]>(() => {
  const sections: DropdownMenuItem[][] = []
  sections.push([
    { label: 'Mein Profil', icon: 'i-lucide-user-round', to: '/profile' },
  ])

  if (props.variant === 'compact') {
    const areaItems: DropdownMenuItem[] = []
    if (isStaff.value) {
      areaItems.push({ label: 'Trainer-Bereich', icon: 'i-lucide-clipboard-list', to: '/trainer' })
    }
    if (isAdmin.value) {
      areaItems.push({ label: 'Admin-Bereich', icon: 'i-lucide-shield', to: '/admin' })
    }
    if (areaItems.length > 0) sections.push(areaItems)
  }

  return sections
})
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'w-64' }">
    <!-- Compact-Trigger (Mobile-Topbar): Avatar + Chevron als Pill. -->
    <UButton
      v-if="variant === 'compact'"
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

    <!-- Expanded-Trigger (Desktop-Drawer-Fuß): voller Profil-Row. -->
    <UButton
      v-else
      variant="ghost"
      color="neutral"
      class="w-full !justify-start !p-2 !pr-3 gap-3 !rounded-lg hover:!bg-elevated/60 focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="`Menü für ${displayName}`"
    >
      <UAvatar :alt="displayName" :text="initials" size="md" class="shrink-0" />
      <div class="min-w-0 flex-1 text-left">
        <div class="font-semibold text-sm truncate leading-tight">
          {{ displayName }}
        </div>
        <div class="flex items-center gap-1.5 mt-1 min-w-0">
          <span
            v-if="primaryRole"
            class="mono text-[10px] font-semibold tracking-[0.14em] uppercase text-muted leading-none"
          >
            {{ primaryRole }}
          </span>
          <span
            v-if="primaryRole && profile"
            class="inline-block size-1 rounded-full bg-[color:var(--rule)] shrink-0"
            aria-hidden="true"
          />
          <span
            v-if="profile"
            class="mono text-[11px] font-medium tabular-nums text-primary leading-none"
          >
            LK {{ profile.dtbLk.toFixed(1) }}
          </span>
        </div>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3.5 text-muted shrink-0"
        aria-hidden="true"
      />
    </UButton>

    <!-- Header im Dropdown-Content: nur in der compact-Variante zeigen —
         expanded hat das Profil schon im Trigger und doppelt nicht. Außerdem
         nicht in Sub-Menüs (Nuxt UI proxiert content-slots in Children-
         Dropdowns; daher das `!sub`-Gate). -->
    <template #content-top="{ sub }">
      <div
        v-if="profile && !sub && variant === 'compact'"
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
