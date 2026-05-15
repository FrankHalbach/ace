/**
 * Client-seitige Route-Middleware: wenn die Session leer ist, leite zu /login.
 *
 * Nur explizit auf Seiten gesetzt (definePageMeta), die einen Login erfordern.
 * Server-seitig schützt server/middleware/00-auth.ts die /api/*-Routen.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
