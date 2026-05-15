/**
 * Client-seitige Route-Middleware: Trainer-only-Pages (Admin darf auch).
 * Server-Endpoints prüfen die Rolle nochmal — das hier ist nur UX, kein Schutz.
 */
export default defineNuxtRouteMiddleware(() => {
  const { user, loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/login')
  }
  const roles = user.value?.roles ?? []
  if (!roles.includes('trainer') && !roles.includes('admin')) {
    return navigateTo('/')
  }
})
