import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { captchaToken } from './captcha'
import { isPasswordLeaked } from './pwned'
import type { Plan } from './plans'

export type Profile = { id: string; full_name: string }
export type Business = {
  id: string
  name: string
  slug: string
  cancel_min_hours: number
  min_notice_hours: number
  max_advance_days: number
  phone: string | null
  address: string | null
  logo_path: string | null
  monthly_goal: number | null // meta de ganancias por mes (Estadísticas, migración 035)
  plan: Plan // el contratado; durante la prueba vale el Pro (ver effectivePlan, migración 036)
  trial_ends_at: string | null
}
// owner: el dueño del negocio (ve todo). staff: un profesional con cuenta (solo su agenda; migración 029).
export type Role = 'owner' | 'staff'
export type StaffResource = { id: string; name: string }

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  business: Business | null
  role: Role | null
  staffResource: StaffResource | null
  loading: boolean
  recovering: boolean
  // Entró con la contraseña pero tiene la verificación en dos pasos activada: falta el código de la app
  mfaPending: boolean
  verifyMfa: (code: string) => Promise<string | null>
  requestPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string, invite?: { token: string; redirectTo: string }) => Promise<string | null>
  resendConfirmation: (email: string) => Promise<string | null>
  verifyEmailCode: (email: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshBusiness: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Token del CAPTCHA, o null si no se pudo resolver (la función que llama devuelve el error)
async function tryCaptcha(): Promise<string | undefined | null> {
  try { return await captchaToken() } catch { return null }
}
const CAPTCHA_FAILED = 'captcha_failed'
const LEAKED_PASSWORD = 'leaked_password'

const BUSINESS_COLUMNS = 'id, name, slug, cancel_min_hours, min_notice_hours, max_advance_days, phone, address, logo_path, monthly_goal, plan, trial_ends_at'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [staffResource, setStaffResource] = useState<StaffResource | null>(null)
  const [loading, setLoading] = useState(true)
  // true mientras la persona llegó desde el mail de "olvidé mi contraseña" y falta elegir la nueva
  const [recovering, setRecovering] = useState(() => window.location.hash.includes('type=recovery'))
  const [mfaPending, setMfaPending] = useState(false)

  // Persona cuyos datos ya se pidieron (undefined: ninguna todavía). Supabase avisa de la sesión varias veces
  // (al abrir, al renovar el acceso cada hora, al volver a la pestaña) y perfil y negocio solo cambian con la persona.
  const loadedUserRef = useRef<string | null | undefined>(undefined)

  async function loadUserData(userId: string) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles').select('id, full_name').eq('id', userId).single()
    setProfile(profileData)

    const { data: businessData, error: businessError } = await supabase
      .from('businesses').select(BUSINESS_COLUMNS).eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    // Si algo falló, el próximo aviso de la sesión lo vuelve a intentar
    if (profileError || businessError) loadedUserRef.current = undefined
    if (businessData) {
      setBusiness(businessData)
      setRole('owner')
      setStaffResource(null)
      return
    }

    // Sin negocio propio: puede ser un profesional que se sumó con una invitación
    const { data: membership, error: membershipError } = await supabase
      .from('staff_members').select(`resources(id, name), businesses(${BUSINESS_COLUMNS})`)
      .eq('user_id', userId).maybeSingle()
    if (membershipError) loadedUserRef.current = undefined
    const staff = membership as { resources: StaffResource | null; businesses: Business | null } | null
    setBusiness(staff?.businesses ?? null)
    setRole(staff?.businesses ? 'staff' : null)
    setStaffResource(staff?.businesses ? staff.resources : null)
  }

  // La sesión siempre se actualiza; perfil y negocio se piden solo si cambió la persona (si no, el panel
  // recibiría un negocio "nuevo" y volvería a pedir todo)
  function syncUser(newSession: Session | null) {
    setSession(newSession)
    const userId = newSession?.user.id ?? null
    if (userId === loadedUserRef.current) return
    loadedUserRef.current = userId
    if (!userId) {
      setProfile(null); setBusiness(null); setRole(null); setStaffResource(null); setMfaPending(false)
      setLoading(false)
      return
    }
    void (async () => {
      // Con la verificación en dos pasos activada y sin el código todavía, la base no devuelve nada (migración 043):
      // primero el código y recién después los datos. Al verificarlo llega otro aviso de sesión y se vuelve a pasar por acá.
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (level?.nextLevel === 'aal2' && level.currentLevel !== 'aal2') {
        loadedUserRef.current = undefined
        setMfaPending(true)
        return
      }
      setMfaPending(false)
      await loadUserData(userId)
    })().finally(() => setLoading(false))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => syncUser(data.session))

    // Sin await adentro: esperar otra llamada a Supabase dentro de este aviso puede trabarlo (lo advierte su documentación)
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      syncUser(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const captcha = await tryCaptcha()
    if (captcha === null) return CAPTCHA_FAILED
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha } })
    return error ? error.message : null
  }

  // invite: registro desde un enlace de invitación. El token queda en la cuenta (join_token) y la base la suma al
  // equipo sola apenas se confirma el email, desde cualquier dispositivo (migración 032). redirectTo es adónde vuelve
  // el enlace del mail (si Supabase no lo permite, usa la URL del sitio).
  async function signUp(email: string, password: string, fullName: string, invite?: { token: string; redirectTo: string }) {
    if (await isPasswordLeaked(password)) return LEAKED_PASSWORD
    const captcha = await tryCaptcha()
    if (captcha === null) return CAPTCHA_FAILED
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: captcha,
        data: { full_name: fullName, ...(invite ? { join_token: invite.token } : {}) },
        ...(invite ? { emailRedirectTo: invite.redirectTo } : {}),
      },
    })
    if (error) return error.message
    if (!data.user) return 'No se pudo crear la cuenta'
    // El perfil lo crea el trigger handle_new_user en la base de datos
    return null
  }

  // Vuelve a mandar el mail de "confirmá tu cuenta" del alta (Supabase limita cuántos se pueden pedir por hora)
  async function resendConfirmation(email: string) {
    const captcha = await tryCaptcha()
    if (captcha === null) return CAPTCHA_FAILED
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { captchaToken: captcha } })
    return error ? error.message : null
  }

  // El código de 6 dígitos del mail de alta (OTP): confirma el email y deja la sesión iniciada
  async function verifyEmailCode(email: string, code: string) {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'signup' })
    return error ? error.message : null
  }

  async function requestPasswordReset(email: string) {
    const captcha = await tryCaptcha()
    if (captcha === null) return CAPTCHA_FAILED
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin, captchaToken: captcha })
    return error ? error.message : null
  }

  async function updatePassword(password: string) {
    if (await isPasswordLeaked(password)) return LEAKED_PASSWORD
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return error.message
    setRecovering(false)
    return null
  }

  // El código de 6 dígitos de la app autenticadora (Google Authenticator, Microsoft Authenticator…)
  async function verifyMfa(code: string) {
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp.find(item => item.status === 'verified')
    if (listError || !factor) return listError?.message ?? 'No encontramos la verificación en dos pasos de tu cuenta.'
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    return error ? error.message : null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshBusiness() {
    if (session) await loadUserData(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, business, role, staffResource, loading, recovering, mfaPending, verifyMfa, requestPasswordReset, updatePassword, signIn, signUp, resendConfirmation, verifyEmailCode, signOut, refreshBusiness }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
