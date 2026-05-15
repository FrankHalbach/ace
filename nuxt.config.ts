// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

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
    // direkt aus der env gelesen; NUXT_BREVO_API_KEY und NUXT_DB_PATH lesen
    // wir via process.env in den jeweiligen Modulen).
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Täglich 03:00 — abgelaufene Magic-Link-Tokens löschen
      '0 3 * * *': ['cleanup-expired-tokens'],
    },
  },
})
