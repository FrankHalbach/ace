// @ts-check
// ESLint flat config.
// Base wird von @nuxt/eslint nach `nuxt prepare` unter .nuxt/eslint.config.mjs generiert.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // -------------------------------------------------------------------------
  // ADR-005 Modul-Schnitt: Cross-Modul-Imports nur via <modul>/index.ts.
  //
  // Direkte Imports in fremde Modul-internas (service/, repository/, api/)
  // sind verboten. Innerhalb desselben Moduls bleiben sie erlaubt — dafür
  // sorgt die zweite Config-Section.
  // -------------------------------------------------------------------------
  {
    name: 'ace/module-boundaries',
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/server/modules/*/service/**',
              '**/server/modules/*/repository/**',
              '**/server/modules/*/api/**',
            ],
            message:
              'Cross-Modul-Imports gehen über <modul>/index.ts. ' +
              'Siehe docs/decisions/005-modul-schnitt.md.',
          },
        ],
      }],
    },
  },

  // Override: innerhalb desselben Moduls darf alles relativ importiert werden.
  // ESLint matcht die Files; relative Imports erfüllen die obige Regel ohnehin
  // nicht, weil der Pfad nicht das Pattern '**/server/modules/*/...' erfüllt.
  // Diese Section ist als Erinnerung für später, wenn ggf. Feintuning nötig wird.

  // -------------------------------------------------------------------------
  // Code-Stil
  // -------------------------------------------------------------------------
  {
    name: 'ace/general',
    rules: {
      // CLAUDE.md: keine any-Types außer mit Kommentar
      '@typescript-eslint/no-explicit-any': 'warn',
      // Funktionale Defaults
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
)
