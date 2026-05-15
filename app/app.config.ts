/**
 * Nuxt-UI-Theme-Overrides.
 *
 * Erste Annäherung: Tailwind-Default-Paletten, die den Spec-Tokens am
 * nächsten kommen (siehe docs/design-system.md). Eine eigene Palette
 * (`tennis-green`, `court-orange`) folgt, sobald wir reale Screens haben
 * und die Token-Treue in einem Style-Guide-HTML prüfen.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      secondary: 'orange',
      neutral: 'stone',
    },
  },
})
