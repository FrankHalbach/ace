<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'CSV-Import' })

const toast = useToast()

type ImportError = {
  row: number
  code: 'import.row-validation-failed'
  message: string
}

type ImportReport = {
  imported: number
  skipped: number
  skippedEmails: string[]
  errors: ImportError[]
}

const file = ref<File | null>(null)
const previewLines = ref<string[]>([])
const dragging = ref(false)
const uploading = ref(false)
const report = ref<ImportReport | null>(null)

async function loadPreview(f: File) {
  file.value = f
  report.value = null
  const text = await f.text()
  const stripped = text.startsWith('﻿') ? text.slice(1) : text
  previewLines.value = stripped.split(/\r?\n/).slice(0, 6).filter((l) => l.length > 0)
}

function onDrop(ev: DragEvent) {
  ev.preventDefault()
  dragging.value = false
  const f = ev.dataTransfer?.files[0]
  if (f) void loadPreview(f)
}

function onFileInput(ev: Event) {
  const target = ev.target as HTMLInputElement
  const f = target.files?.[0]
  if (f) void loadPreview(f)
}

function reset() {
  file.value = null
  previewLines.value = []
  report.value = null
}

async function submit() {
  if (!file.value) return
  uploading.value = true
  report.value = null
  try {
    const form = new FormData()
    form.append('file', file.value)
    const res = await $fetch<ImportReport>('/api/admin/members/import', {
      method: 'POST',
      body: form,
    })
    report.value = res
    if (res.imported > 0) {
      toast.add({
        title: `${res.imported} Mitglied${res.imported === 1 ? '' : 'er'} importiert`,
        color: 'primary',
      })
    } else if (res.errors.length === 0 && res.skipped > 0) {
      toast.add({
        title: 'Nichts importiert — alle Email-Adressen existieren bereits',
        color: 'warning',
      })
    } else {
      toast.add({
        title: 'Nichts importiert — siehe Fehler-Report',
        color: 'warning',
      })
    }
  } catch (err: unknown) {
    toast.add({
      title: 'Import fehlgeschlagen',
      description: apiError(err),
      color: 'error',
    })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 max-w-3xl md:py-14">
    <header class="mb-6">
      <NuxtLink to="/admin/members" class="text-sm text-muted hover:text-default">
        ← Mitglieder
      </NuxtLink>
      <h1 class="text-2xl font-semibold mt-2">CSV-Import</h1>
      <p class="text-muted text-sm mt-1">
        Initial-Import von Mitgliedern aus einer CSV-Datei (FR-60). Insert-only —
        bestehende Email-Adressen werden übersprungen, keine Updates.
      </p>
    </header>

    <UCard class="mb-6">
      <h2 class="font-semibold mb-3">Format</h2>
      <p class="text-sm mb-3">
        UTF-8, semikolon- oder kommagetrennt, Header in der ersten Zeile.
        Excel-Tipp: „Speichern als ‚CSV UTF-8 (durch Trennzeichen getrennt)
        (*.csv)'".
      </p>
      <pre class="mono text-xs bg-elevated/40 p-3 rounded overflow-x-auto">firstName;lastName;birthYear;gender;email;dtbLk
Max;Müller;1985;m;max@example.org;8.3
Lisa;Schmidt;2008;w;lisa@example.org;14.5</pre>
      <ul class="text-xs text-muted mt-3 space-y-0.5">
        <li>• <strong>gender</strong>: <code>m</code> oder <code>w</code></li>
        <li>• <strong>birthYear</strong>: zwischen 1920 und heute</li>
        <li>• <strong>dtbLk</strong>: 1.0 bis 25.0</li>
        <li>• <strong>email</strong>: muss gültig sein, wird in Kleinbuchstaben gespeichert</li>
      </ul>
    </UCard>

    <!-- Drag-Drop -->
    <div
      v-if="!file"
      class="border-2 border-dashed rounded-lg p-10 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-default'"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop="onDrop"
    >
      <UIcon name="i-lucide-upload-cloud" class="size-10 text-muted mx-auto mb-3" />
      <p class="text-sm mb-3">Datei hierher ziehen oder…</p>
      <label class="inline-block">
        <input type="file" accept=".csv,text/csv" class="hidden" @change="onFileInput">
        <UButton as="span" color="primary" variant="soft">Datei auswählen</UButton>
      </label>
    </div>

    <!-- Vorschau + Submit -->
    <div v-else>
      <UCard class="mb-4">
        <div class="flex items-baseline justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ file.name }}</h2>
            <p class="text-xs text-muted mt-0.5">
              {{ (file.size / 1024).toFixed(1) }} KB · {{ previewLines.length }} Zeilen Vorschau
            </p>
          </div>
          <UButton variant="ghost" size="sm" icon="i-lucide-x" :disabled="uploading" @click="reset">
            Andere Datei
          </UButton>
        </div>
        <pre class="mono text-xs bg-elevated/40 p-3 rounded overflow-x-auto mt-3">{{ previewLines.join('\n') }}</pre>
      </UCard>

      <div class="flex gap-2 justify-end mb-6">
        <UButton variant="ghost" color="neutral" :disabled="uploading" @click="reset">
          Abbrechen
        </UButton>
        <UButton color="primary" :loading="uploading" @click="submit">
          Import starten
        </UButton>
      </div>
    </div>

    <!-- Ergebnis-Report -->
    <UCard v-if="report" class="mb-6">
      <h2 class="font-semibold mb-3">Ergebnis</h2>
      <div class="grid grid-cols-3 gap-3 text-center mb-4">
        <div class="border border-default rounded p-3">
          <div class="text-2xl font-semibold text-[color:var(--success)]">{{ report.imported }}</div>
          <div class="text-xs text-muted mt-1">importiert</div>
        </div>
        <div class="border border-default rounded p-3">
          <div class="text-2xl font-semibold text-muted">{{ report.skipped }}</div>
          <div class="text-xs text-muted mt-1">übersprungen</div>
        </div>
        <div class="border border-default rounded p-3">
          <div class="text-2xl font-semibold text-[color:var(--danger)]">{{ report.errors.length }}</div>
          <div class="text-xs text-muted mt-1">Fehler</div>
        </div>
      </div>

      <details v-if="report.skippedEmails.length > 0" class="mt-3">
        <summary class="text-sm font-medium cursor-pointer">
          Übersprungene Emails ({{ report.skippedEmails.length }})
        </summary>
        <ul class="text-xs text-muted mt-2 space-y-0.5 pl-4">
          <li v-for="email in report.skippedEmails" :key="email" class="mono">
            {{ email }}
          </li>
        </ul>
      </details>

      <details v-if="report.errors.length > 0" class="mt-3" open>
        <summary class="text-sm font-medium cursor-pointer text-[color:var(--danger)]">
          Validierungs-Fehler ({{ report.errors.length }})
        </summary>
        <ul class="text-xs mt-2 space-y-1 pl-4">
          <li v-for="err in report.errors" :key="err.row">
            <span class="mono text-muted">Zeile {{ err.row }}:</span>
            {{ err.message }}
          </li>
        </ul>
      </details>

      <div class="flex gap-2 justify-end mt-6">
        <NuxtLink to="/admin/members">
          <UButton variant="soft" color="primary">Zurück zur Mitgliederliste</UButton>
        </NuxtLink>
      </div>
    </UCard>
  </UContainer>
</template>
