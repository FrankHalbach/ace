// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/fonts', '@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  // @nuxt/fonts scant CSS nach font-family-Verwendung, lädt Source Sans 3 und
  // JetBrains Mono beim Build von Google Fonts herunter, hostet sie lokal aus
  // public/_fonts/ und generiert @font-face-Regeln. Keine Runtime-Connection zu
  // fonts.googleapis.com mehr — DSGVO-konform ohne separate Einwilligung.
  fonts: {
    defaults: {
      weights: [400, 500, 600, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  runtimeConfig: {
    public: {
      // aus .env: NUXT_PUBLIC_BASE_URL
      baseUrl: 'http://localhost:3000',
    },
    // Server-only runtime config (NUXT_SESSION_PASSWORD wird von nuxt-auth-utils
    // direkt aus der env gelesen; NUXT_SMTP_* und NUXT_DB_PATH lesen wir via
    // process.env in den jeweiligen Modulen).
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Täglich 03:00 — Tokens, Challenges, Match-Results aufräumen
      '0 3 * * *': [
        'cleanup-expired-tokens',
        'dispute-stale-accepted',
        'auto-dispute-pending-results',
        'auto-dispute-friendly-results',
      ],
      // Stündlich — PROPOSED-Challenges auf EXPIRED setzen
      '0 * * * *': ['expire-proposed-challenges'],
    },
  },
})
