// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      link: [
        // Brand fonts per docs/design-system.md §4.1.
        // Source Sans 3: body + headings · JetBrains Mono: IDs, LK, scores.
        // Fraunces deliberately not loaded (reserved for marketing).
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
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
    // direkt aus der env gelesen; NUXT_BREVO_API_KEY und NUXT_DB_PATH lesen
    // wir via process.env in den jeweiligen Modulen).
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
