// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    'nuxt-auth-utils',
  ],

  typescript: {
    strict: true,
    typeCheck: false, // separat per `pnpm typecheck` ausführen
  },

  runtimeConfig: {
    // server-only — aus .env: NUXT_SESSION_PASSWORD, NUXT_BREVO_API_KEY, NUXT_DB_PATH
    sessionPassword: '',
    brevoApiKey: '',
    dbPath: './data/ace.db',
    public: {
      baseUrl: 'http://localhost:3000',
    },
  },

  nitro: {
    experimental: {
      // erlaubt Cron-Job-Handler in server/tasks/
      tasks: true,
    },
  },
})
