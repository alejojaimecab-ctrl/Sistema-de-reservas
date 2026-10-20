import { friendlyError } from './errorMessages'

// Mensajes de Supabase Auth en español y la regla de contraseña del proyecto
// (Supabase → Authentication → Policies: mínimo 6 caracteres, con minúsculas, mayúsculas y números).

export const PASSWORD_HINT = 'Mínimo 6 caracteres, con mayúsculas, minúsculas y números.'
const PASSWORD_RULE = 'La contraseña tiene que tener mínimo 6 caracteres, con mayúsculas, minúsculas y números.'

// Se chequea antes de mandarla: si no, Supabase la rechaza con un error en inglés.
export function passwordProblem(password: string): string | null {
  const ok = password.length >= 6 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
  return ok ? null : PASSWORD_RULE
}

export function authErrorMessage(message: string): string {
  if (/already registered|already been registered/i.test(message)) return 'Ese email ya tiene una cuenta. Iniciá sesión.'
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return 'Mandamos demasiados mails en poco tiempo. Esperá unos minutos y volvé a intentar.'
  }
  if (/password should|weak password|weak_password/i.test(message)) return PASSWORD_RULE
  if (/should be different/i.test(message)) return 'Elegí una contraseña distinta a la anterior.'
  if (/email not confirmed/i.test(message)) return 'Todavía no confirmaste tu email: abrí el último mail de RESER que te llegó.'
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos'
  if (/unable to validate email|invalid format|email address .*invalid/i.test(message)) return 'Ese email no parece válido. Revisalo.'
  return friendlyError(message)
}
