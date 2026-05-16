/**
 * Nuxt-UI-Theme-Overrides.
 *
 * Brand-Paletten (`tennis-green`, `court-clay`, `warm-stone`) sind in
 * `app/assets/css/main.css` als Tailwind-`@theme`-Block registriert,
 * verankert auf den Hex-Tokens aus `app/assets/css/tokens.css`. Status-
 * Farben (success/info/warning/error) bleiben vorerst auf Tailwind-Stock-
 * Paletten — sie sind in der Spec via CSS-Variablen für Custom-Komponenten
 * abgedeckt und werden bei Bedarf später als eigene Paletten ausgebaut.
 *
 * Quelle der Wahrheit für Tokens: `docs/design-system.md`.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'tennis-green',
      secondary: 'court-clay',
      neutral: 'warm-stone',
      success: 'tennis-green', // = primary, per design-system §2.4
      info: 'slate',
      warning: 'amber',
      error: 'red',
    },
  },
})
