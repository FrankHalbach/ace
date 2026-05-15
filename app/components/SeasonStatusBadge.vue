<script setup lang="ts">
type Status = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'

const props = defineProps<{ status: Status }>()

const variants: Record<Status, { label: string; classes: string }> = {
  PLANNED: { label: 'Geplant', classes: 'bg-stone-200 text-stone-700' },
  ACTIVE: { label: 'Aktiv', classes: 'bg-emerald-100 text-emerald-800' },
  CLOSED: { label: 'Geschlossen', classes: 'bg-orange-100 text-orange-800' },
  ARCHIVED: { label: 'Archiviert', classes: 'bg-stone-100 text-stone-500' },
}

const variant = computed(() => variants[props.status])
</script>

<template>
  <span
    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-mono"
    :class="variant.classes"
  >
    {{ variant.label }}
  </span>
</template>
