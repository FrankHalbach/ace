<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : null))

useHead({ title: 'E-Mail-Bestätigung' })
</script>

<template>
  <UContainer class="py-16 md:py-24 max-w-md">
    <!-- BRAND -->
    <p class="anim anim-1 mono text-[10px] font-semibold tracking-[0.22em] uppercase text-muted mb-6 inline-flex items-center gap-2">
      <span class="inline-block w-5 h-[2px] bg-[color:var(--accent)]" aria-hidden="true" />
      TuS Neureut · Tennis
    </p>

    <!-- HERO -->
    <header class="anim anim-2 mb-8">
      <UIcon name="i-lucide-mail-check" class="size-9 text-primary mb-4" />
      <h1 class="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-tight">
        Prüfe dein Postfach
      </h1>
    </header>

    <!-- BODY -->
    <div class="anim anim-3 space-y-4 text-[15px] leading-relaxed">
      <p>
        Wir haben dir einen Anmelde-Link
        <template v-if="email">
          an <span class="font-mono tabular-nums text-sm bg-[color:var(--bg-soft)] px-1.5 py-0.5 rounded">{{ email }}</span>
        </template>
        geschickt. Klick auf den Link, um dich anzumelden.
      </p>
      <p class="text-sm text-muted">
        Der Link ist 15 Minuten gültig und kann nur einmal verwendet werden.
      </p>
    </div>

    <!-- FINE PRINT -->
    <p class="anim anim-4 text-xs text-muted mt-10 pt-6 border-t border-default leading-relaxed">
      Keine E-Mail bekommen? Schau in den Spam-Ordner oder
      <NuxtLink to="/login" class="text-primary underline underline-offset-2">
        fordere einen neuen Link an
      </NuxtLink>.
    </p>
  </UContainer>
</template>
