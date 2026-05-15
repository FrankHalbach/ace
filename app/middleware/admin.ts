/**
 * Client-seitige Route-Middleware: Admin-only-Pages.
 * Server-Endpoints prüfen die Rolle nochmal — das hier ist nur UX, kein Schutz.
 */
export default defineNuxtRouteMiddleware(() => {
  const { user, loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/login')
  }
  if (!user.value?.roles.includes('admin')) {
    return navigateTo('/')
  }
})
