<script setup lang="ts">
const { loggedIn, user } = useUserSession()
const route = useRoute()

// Termine als App-Shell-Kontext — rechter Rail rendert sie auf allen Pages
// ab xl, nicht nur auf Home. useTermine() teilt sich Daten via Nuxt-Cache
// mit anderen Callern (z. B. Home für heroSub). dateChip/relativeUpcoming
// werden vom selben Composable-Modul exportiert und auto-importiert.
const { nextMatch, upcomingRest } = await useTermine()
const termineEmpty = computed(() => !nextMatch.value && upcomingRest.value.length === 0)

type TabGroup = 'main' | 'tennis' | 'area'

type Tab = {
  label: string
  to: string
  icon: string
  activeWhen: (path: string) => boolean
  group: TabGroup
  /** Sichtbar in der Mobil-Bottom-Tab (max 4 Items). */
  isMobile: boolean
  /** Rollen-Gate. undefined = für alle sichtbar. */
  requiresRole?: 'trainer-or-admin' | 'admin'
}

// Segment-genaues Path-Match — sonst kollidieren z. B. /spieler und /spiele,
// weil "spieler" mit "spiele" beginnt.
function pathHas(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

// IA:
//   Mobile-Bottom-Tab + Desktop-Drawer-Hauptgruppen tragen vier Top-Level-
//   Surfaces: Start · Rangliste · Forderungen · Friendlies. „Spiele" als
//   kombinierter Eintrag ist aufgesplittet, damit Friendlies first-class
//   erreichbar sind (vorher nur über Schnellzugriff bzw. Spieler-Detail).
//   Trainer/Admin sind rollen-gegated und liegen im Drawer-Bereich-Block
//   (Desktop) bzw. im UserMenu-Dropdown (Mobile).
const tabs: Tab[] = [
  {
    label: 'Start',
    to: '/',
    icon: 'i-lucide-house',
    activeWhen: (p) => p === '/',
    group: 'main',
    isMobile: true,
  },
  {
    label: 'Rangliste',
    to: '/ranglisten',
    icon: 'i-lucide-target',
    activeWhen: (p) => pathHas(p, '/ranglisten') || pathHas(p, '/spieler'),
    group: 'tennis',
    isMobile: true,
  },
  {
    label: 'Forderungen',
    to: '/challenges',
    icon: 'i-lucide-swords',
    activeWhen: (p) => pathHas(p, '/challenges'),
    group: 'tennis',
    isMobile: true,
  },
  {
    label: 'Friendlies',
    to: '/friendlies',
    icon: 'i-lucide-handshake',
    activeWhen: (p) => pathHas(p, '/friendlies'),
    group: 'tennis',
    isMobile: true,
  },
  {
    label: 'Trainer',
    to: '/trainer',
    icon: 'i-lucide-clipboard-list',
    activeWhen: (p) => pathHas(p, '/trainer'),
    group: 'area',
    isMobile: false,
    requiresRole: 'trainer-or-admin',
  },
  {
    label: 'Admin',
    to: '/admin',
    icon: 'i-lucide-shield',
    activeWhen: (p) => pathHas(p, '/admin'),
    group: 'area',
    isMobile: false,
    requiresRole: 'admin',
  },
]

const roles = computed(() => user.value?.roles ?? [])

function isVisible(tab: Tab): boolean {
  if (tab.requiresRole === 'admin') return roles.value.includes('admin')
  if (tab.requiresRole === 'trainer-or-admin') {
    return roles.value.includes('trainer') || roles.value.includes('admin')
  }
  return true
}

const mainGroup = computed(() => tabs.filter((t) => t.group === 'main' && isVisible(t)))
const tennisGroup = computed(() => tabs.filter((t) => t.group === 'tennis' && isVisible(t)))
const areaGroup = computed(() => tabs.filter((t) => t.group === 'area' && isVisible(t)))
const mobileTabs = computed(() => tabs.filter((t) => t.isMobile && isVisible(t)))

const activePath = computed(() => route.path)
</script>

<template>
  <div
    class="min-h-screen bg-default"
    :class="loggedIn ? 'lg:grid lg:grid-cols-[256px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)_320px]' : ''"
  >
    <!-- ====================================================================
         DESKTOP DRAWER (≥ lg) — permanente Hauptnav als linkes Rail.
         Brand oben · gruppierte Nav (Mein Bereich / Tennis / Bereich) ·
         UserMenu (Avatar + Name + LK) im Fuß.
         ==================================================================== -->
    <aside
      v-if="loggedIn"
      class="hidden lg:flex flex-col gap-7 sticky top-0 h-screen overflow-y-auto border-r border-default bg-[color:var(--bg-soft)] px-4 py-6"
      aria-label="Hauptnavigation"
    >
      <NuxtLink
        to="/"
        class="inline-flex items-baseline gap-2 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
        aria-label="ace · zur Startseite"
      >
        <span class="text-[26px] font-bold tracking-[-0.02em] leading-none">ace</span>
        <span
          class="inline-block size-[9px] rounded-full bg-[color:var(--tennis-ball)] -translate-y-[3px] ring-2 ring-[color:var(--tennis-ball)]/35"
          aria-hidden="true"
        />
        <span
          class="mono text-[10px] font-medium tracking-[0.22em] uppercase text-muted leading-none"
        >
          TuS Neureut
        </span>
      </NuxtLink>

      <!-- Start als eigene Sektion ohne Headline (kompakter Einstieg). -->
      <nav class="flex flex-col gap-0.5" aria-label="Persönlich">
        <NuxtLink
          v-for="tab in mainGroup"
          :key="tab.to"
          :to="tab.to"
          class="drawer-item"
          :class="{ 'is-active': tab.activeWhen(activePath) }"
          :aria-current="tab.activeWhen(activePath) ? 'page' : undefined"
        >
          <UIcon :name="tab.icon" class="size-4 shrink-0" />
          <span>{{ tab.label }}</span>
        </NuxtLink>
      </nav>

      <nav v-if="tennisGroup.length > 0" class="flex flex-col gap-0.5" aria-label="Tennis">
        <h3 class="drawer-group-label">Tennis</h3>
        <NuxtLink
          v-for="tab in tennisGroup"
          :key="tab.to"
          :to="tab.to"
          class="drawer-item"
          :class="{ 'is-active': tab.activeWhen(activePath) }"
          :aria-current="tab.activeWhen(activePath) ? 'page' : undefined"
        >
          <UIcon :name="tab.icon" class="size-4 shrink-0" />
          <span>{{ tab.label }}</span>
        </NuxtLink>
      </nav>

      <nav v-if="areaGroup.length > 0" class="flex flex-col gap-0.5" aria-label="Bereich">
        <h3 class="drawer-group-label">Bereich</h3>
        <NuxtLink
          v-for="tab in areaGroup"
          :key="tab.to"
          :to="tab.to"
          class="drawer-item"
          :class="{ 'is-active': tab.activeWhen(activePath) }"
          :aria-current="tab.activeWhen(activePath) ? 'page' : undefined"
        >
          <UIcon :name="tab.icon" class="size-4 shrink-0" />
          <span>{{ tab.label }}</span>
        </NuxtLink>
      </nav>

      <div class="flex-1" />

      <div class="border-t border-default pt-4">
        <ClientOnly>
          <UserMenu variant="expanded" />
          <template #fallback>
            <div class="h-12" />
          </template>
        </ClientOnly>
      </div>
    </aside>

    <!-- ====================================================================
         CONTENT WRAPPER — Topbar (Mobile) + Main
         ==================================================================== -->
    <div class="flex flex-col min-h-screen">
      <!-- Mobile Topbar: Brand + Avatar. Kein Hamburger — die 4er-Bottom-Tab
           trägt die Hauptnav unten, Trainer/Admin/Profile/Theme/Logout
           liegen im UserMenu-Dropdown. -->
      <header
        v-if="loggedIn"
        class="lg:hidden sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur supports-[backdrop-filter]:bg-default/75"
      >
        <div class="flex items-center gap-3 px-4 py-3">
          <NuxtLink
            to="/"
            class="shrink-0 inline-flex items-baseline gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md -mx-1 px-1"
            aria-label="ace · zur Startseite"
          >
            <span class="text-xl font-bold tracking-tight leading-none">ace</span>
            <span
              class="inline-block size-2 rounded-full bg-[color:var(--tennis-ball)] -translate-y-[2px]"
              aria-hidden="true"
            />
            <span
              class="mono hidden xs:inline text-[10px] font-medium tracking-[0.18em] uppercase text-muted leading-none"
            >
              TuS Neureut
            </span>
          </NuxtLink>

          <div class="flex-1" />

          <ClientOnly>
            <UserMenu />
            <template #fallback>
              <div class="size-10" />
            </template>
          </ClientOnly>
        </div>
      </header>

      <main class="flex-1" :class="loggedIn ? 'pb-24 lg:pb-0' : ''">
        <slot />
      </main>
    </div>

    <!-- ====================================================================
         RECHTER DRAWER (≥ xl) — App-Shell-Termine. Sichtbar auf allen
         Pages für eingeloggte User. Daten kommen aus useTermine() und sind
         dank Nuxt-Cache geteilt mit anderen Callern (z. B. Home-Hero-Sub).
         Kein Teleport mehr (Vue's moveTeleport-Crash mit reaktivem
         :disabled + v-if-Children war fragil) — das Layout rendert direkt.
         ==================================================================== -->
    <aside
      v-if="loggedIn"
      class="hidden xl:flex xl:flex-col gap-10 sticky top-0 h-screen overflow-y-auto border-l border-default bg-gradient-to-b from-[color:var(--bg)] to-[color:var(--bg-soft)] px-7 py-12"
      aria-label="Termine"
    >
      <!-- Empty-State: keine geplanten Termine → Aufruf zur Aktion -->
      <div v-if="termineEmpty" class="flex flex-col gap-4">
        <h2 class="section-head">Termine</h2>
        <p class="text-sm text-muted">
          Keine Termine geplant. Lust auf ein Match?
        </p>
        <div class="flex flex-col gap-2 mt-1">
          <UButton
            to="/ranglisten"
            size="sm"
            color="primary"
            icon="i-lucide-swords"
            class="rounded-full justify-center"
            block
          >
            Forderung senden
          </UButton>
          <UButton
            to="/friendlies/new"
            size="sm"
            variant="soft"
            color="secondary"
            icon="i-lucide-handshake"
            class="rounded-full justify-center"
            block
          >
            Friendly planen
          </UButton>
        </div>
      </div>

      <!-- ALS NÄCHSTES — Hero-Card mit Court-Line-Top-Edge -->
      <section v-if="nextMatch">
        <div class="section-head__wrap mb-3">
          <h2 class="section-head">Als nächstes</h2>
          <NuxtLink
            to="/friendlies"
            class="text-xs text-muted hover:text-primary inline-flex items-center gap-1 transition-colors"
          >
            Alle Termine
            <UIcon name="i-lucide-arrow-right" class="size-3.5" />
          </NuxtLink>
        </div>
        <NuxtLink :to="nextMatch.to" class="next-card group">
          <div class="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5">
            <div class="next-card__chip">
              <span class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted leading-none">
                {{ dateChip(nextMatch.scheduledAt).day }}
              </span>
              <span class="mono text-[22px] font-bold tabular-nums text-primary leading-none mt-1.5 tracking-[-0.02em]">
                {{ dateChip(nextMatch.scheduledAt).num }}
              </span>
              <span class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted leading-none mt-1">
                {{ dateChip(nextMatch.scheduledAt).mon }}
              </span>
            </div>
            <div class="min-w-0">
              <p class="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)] leading-none mb-2 inline-flex items-center gap-2">
                <span class="next-card__pulse" aria-hidden="true" />
                {{ relativeUpcoming(nextMatch.scheduledAt) }}
              </p>
              <h3 class="text-base font-semibold tracking-[-0.005em] truncate leading-snug">
                {{ nextMatch.primary }}
              </h3>
              <p v-if="nextMatch.courtInfo" class="text-sm text-muted mt-1 truncate">
                {{ nextMatch.courtInfo }}
              </p>
            </div>
            <UIcon name="i-lucide-arrow-right" class="size-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </NuxtLink>
      </section>

      <!-- GEPLANT — Liste der verbleibenden Termine -->
      <section v-if="upcomingRest.length > 0">
        <div class="section-head__wrap mb-3">
          <h2 class="section-head">Geplant · {{ upcomingRest.length }}</h2>
        </div>
        <ul class="divide-y divide-default border-y border-default">
          <li v-for="item in upcomingRest" :key="item.key">
            <NuxtLink :to="item.to" class="list-row group">
              <span class="date-chip shrink-0">
                <span class="mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted leading-none">
                  {{ item.scheduledAt.toLocaleDateString('de-DE', { weekday: 'short' }) }}
                </span>
                <span class="mono text-sm font-bold tabular-nums text-primary leading-none mt-1 tracking-[-0.01em]">
                  {{ item.scheduledAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }}
                </span>
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-[15px] font-semibold truncate tracking-[-0.005em] group-hover:text-primary transition-colors">
                  {{ item.primary }}
                </div>
                <div class="text-xs text-muted truncate mt-0.5">
                  {{ item.scheduledAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr<span v-if="item.courtInfo"> · {{ item.courtInfo }}</span>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </NuxtLink>
          </li>
        </ul>
      </section>
    </aside>

    <!-- ====================================================================
         MOBILE BOTTOM-TAB (< lg) — 4 Items, splittet "Spiele" nativ in
         Forderungen + Friendlies (genau das, was der Drawer auf Desktop
         strukturell auch macht).
         ==================================================================== -->
    <nav
      v-if="loggedIn"
      class="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-default bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/85 pb-[env(safe-area-inset-bottom)]"
      aria-label="Hauptnavigation mobil"
    >
      <span
        class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px h-px w-10 bg-[color:var(--tennis-ball)] opacity-60"
        aria-hidden="true"
      />
      <div class="grid grid-cols-4 items-stretch h-16">
        <NuxtLink
          v-for="tab in mobileTabs"
          :key="tab.to"
          :to="tab.to"
          class="relative flex flex-col items-center justify-center gap-1.5 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:bg-elevated"
          :class="tab.activeWhen(activePath) ? 'text-primary' : 'text-muted'"
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
/* Brand-Wordmark zeigt "TuS Neureut" erst ab xs — auf sehr schmalen
   Geräten weicht der Untertitel, der ace-Mark bleibt. */
@media (min-width: 400px) {
  .xs\:inline { display: inline; }
}

/* ---------- Drawer-Primitive ---------- */

.drawer-group-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-soft);
  padding: 0 12px 8px;
  margin: 0;
}

.drawer-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-muted);
  transition: color 150ms ease, background 150ms ease;
}
.drawer-item:hover {
  color: var(--ink);
  background: color-mix(in oklab, var(--surface) 60%, transparent);
}
.drawer-item.is-active {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: 600;
}
.drawer-item.is-active::before {
  /* Court-Line-Tick links neben aktivem Item — visuell wie ein angekippter
     Court-Line-Akzent statt klobiger Full-Width-Highlight. */
  content: "";
  position: absolute;
  left: -16px;
  top: 50%;
  width: 3px;
  height: 18px;
  background: var(--accent);
  transform: translateY(-50%);
  border-radius: 0 2px 2px 0;
}
</style>
