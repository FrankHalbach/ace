<script setup lang="ts">
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="min-h-screen bg-default">
    <header
      v-if="loggedIn"
      class="border-b border-stone-200 dark:border-stone-800 bg-default"
    >
      <UContainer class="flex items-center justify-between py-3 max-w-3xl">
        <NuxtLink to="/" class="font-semibold text-lg">
          ace
          <span class="text-sm font-normal text-stone-500 ml-1">· TuS Neureut</span>
        </NuxtLink>
        <ClientOnly>
          <UserMenu />
          <template #fallback>
            <div class="size-10" />
          </template>
        </ClientOnly>
      </UContainer>
    </header>
    <slot />
  </div>
</template>
