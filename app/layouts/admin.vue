<script setup lang="ts">
// Minimaler Admin-Layout-Wrapper. Auth-Check und Rolle prüft die Page-Middleware.
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <nav class="flex items-center justify-between mb-8 pb-4 border-b border-default">
      <NuxtLink to="/admin" class="font-semibold text-lg text-default">
        ace · Admin
      </NuxtLink>
      <NuxtLink to="/" class="text-sm text-muted hover:text-default">
        ← zur App
      </NuxtLink>
    </nav>
    <slot />
  </UContainer>
</template>
