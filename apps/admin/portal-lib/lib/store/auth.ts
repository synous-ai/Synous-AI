/**
 * Store de auth del portal — CA2 (Clerk).
 *
 * Con la migración a Clerk el token de sesión lo gestiona Clerk directamente
 * (window.Clerk.session.getToken()). Ya no se persiste un accessToken propio
 * en Zustand ni se hace un refresh manual via cookie httpOnly.
 *
 * Este módulo se mantiene como stub para que los imports existentes no rompan
 * durante la transición. NO contiene estado de autenticación real.
 *
 * El email del usuario se obtiene de useUser() de @clerk/nextjs.
 * La identidad del client_account la resuelve el backend via resolveClientAccount
 * usando el clerk_user_id del token.
 */
