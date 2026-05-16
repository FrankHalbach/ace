<script setup lang="ts">
const { loggedIn } = useUserSession()
const route = useRoute()

type Tab = {
  label: string
  to: string
  icon: string
  activeWhen: (path: string) => boolean
}

// Segment-genaues Path-Match — sonst kollidieren z. B. /spieler und /spiele,
// weil "spieler" mit "spiele" beginnt.
function pathHas(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

// IA: 3 Tabs für die Tennis-Surfaces. Mein Profil, Trainer-/Admin-Bereich
// und Einstellungen liegen im UserMenu (oben rechts). Die Spieler-Profile
// (Drill-down aus der Rangliste) bleiben unter "Rangliste".
const tabs: Tab[] = [
  {
    label: 'Start',
    to: '/',
    icon: 'i-lucide-house',
    activeWhen: (p) => p === '/',
  },
  {
    label: 'Rangliste',
    to: '/ranglisten',
    icon: 'i-lucide-target',
    activeWhen: (p) => pathHas(p, '/ranglisten') || pathHas(p, '/spieler'),
  },
  {
    label: 'Spiele',
    to: '/challenges',
    icon: 'i-lucide-swords',
    activeWhen: (p) =>
      pathHas(p, '/challenges') || pathHas(p, '/friendlies') || pathHas(p, '/spiele'),
  },
]

const activePath = computed(() => route.path)
</script>

<template>
  <div class="min-h-screen bg-default flex flex-col">
    <header
      v-if="loggedIn"
      class="sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur supports-[backdrop-filter]:bg-default/75"
    >
      <UContainer class="flex items-center justify-between gap-3 py-3 max-w-3xl md:max-w-4xl">
        <!-- Brand lockup: ace · (tennis-ball dot) · TuS Neureut -->
        <NuxtLink
          to="/"
          class="group shrink-0 inline-flex items-baseline gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md -mx-1 px-1"
          aria-label="ace · zur Startseite"
        >
          <span class="text-xl font-semibold tracking-tight leading-none">ace</span>
          <span
            class="inline-block size-2 rounded-full bg-[color:var(--tennis-ball)] translate-y-[-2px] ring-1 ring-transparent group-hover:ring-[color:var(--tennis-ball)]/40 transition"
            aria-hidden="true"
          />
          <span
            class="mono hidden xs:inline text-[10px] font-medium tracking-[0.18em] uppercase text-muted leading-none"
          >
            TuS Neureut
          </span>
        </NuxtLink>

        <ClientOnly>
          <UserMenu />
          <template #fallback>
            <div class="size-10" />
          </template>
        </ClientOnly>
      </UContainer>
    </header>

    <main class="flex-1" :class="loggedIn ? 'pb-24 sm:pb-0' : ''">
      <slot />
    </main>

    <!-- Mobile-Bottom-Tab-Bar (unter sm) -->
    <nav
      v-if="loggedIn"
      class="fixed bottom-0 left-0 right-0 z-30 sm:hidden border-t border-default bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/85 pb-[env(safe-area-inset-bottom)]"
      aria-label="Hauptnavigation"
    >
      <!-- subtile Court-Center-Mark als Brand-Akzent -->
      <span
        class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px h-px w-10 bg-[color:var(--tennis-ball)] opacity-60"
        aria-hidden="true"
      />
      <div class="grid grid-cols-3 items-stretch h-16">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="relative flex flex-col items-center justify-center gap-1.5 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:bg-elevated"
          :class="tab.activeWhen(activePath)
            ? 'text-primary'
            : 'text-muted'"
          :aria-current="tab.activeWhen(activePath) ? 'page' : undefined"
        >
          <span
            class="size-9 inline-flex items-center justify-center rounded-full transition-all duration-200"
            :class="tab.activeWhen(activePath)
              ? 'bg-primary text-inverted shadow-md scale-[1.02]'
              : 'bg-transparent'"
          >
            <UIcon :name="tab.icon" class="size-5" />
          </span>
          <span
            class="text-[10px] leading-none tracking-wide"
            :class="tab.activeWhen(activePath) ? 'font-semibold' : 'font-medium'"
          >
            {{ tab.label }}
          </span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<style scoped>
/* Brand-Wordmark zeigt "TuS Neureut" erst ab einer Mindest-Breite — auf
   sehr schmalen Geräten weicht der Untertitel, der ace-Mark bleibt. */
@media (min-width: 400px) {
  .xs\:inline {
    display: inline;
  }
}
</style>
