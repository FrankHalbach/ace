// @ts-check
// ESLint flat config.
// Base wird von @nuxt/eslint nach `nuxt prepare` unter .nuxt/eslint.config.mjs generiert.
import withNuxt from './.nuxt/eslint.config.mjs'
import tseslint from 'typescript-eslint'

export default withNuxt(
  // -------------------------------------------------------------------------
  // Vue-Files temporär ignorieren — Vue-TS-Parser-Konfiguration wird mit
  // einem späteren Cleanup-PR korrekt aufgesetzt.
  // -------------------------------------------------------------------------
  {
    name: 'ace/ignores',
    ignores: ['**/*.vue'],
  },

  // -------------------------------------------------------------------------
  // TypeScript-Parser für server/, tests/
  // -------------------------------------------------------------------------
  {
    name: 'ace/ts-server',
    files: ['server/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },

  // -------------------------------------------------------------------------
  // ADR-005 Modul-Schnitt: Cross-Modul-Imports nur via <modul>/index.ts.
  //
  // Direkte Imports in fremde Modul-internas (service/, repository/, api/)
  // sind verboten. Innerhalb desselben Moduls bleiben sie erlaubt.
  // -------------------------------------------------------------------------
  {
    name: 'ace/module-boundaries',
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
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
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Code-Stil
  // -------------------------------------------------------------------------
  {
    name: 'ace/general',
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      // Unbenutzte Parameter mit Underscore-Prefix ignorieren (Interface-
      // Platzhalter, Default-Implementierungen ohne Argument-Verwendung).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
