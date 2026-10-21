import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
  requestPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string, invite?: { token: string; redirectTo: string }) => Promise<string | null>
  resendConfirmation: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshBusiness: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const BUSINESS_COLUMNS = 'id, name, slug, cancel_min_hours, min_notice_hours, max_advance_days, phone, address, logo_path, monthly_goal'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [staffResource, setStaffResource] = useState<StaffResource | null>(null)
  const [loading, setLoading] = useState(true)
  // true mientras la persona llegó desde el mail de "olvidé mi contraseña" y falta elegir la nueva
  const [recovering, setRecovering] = useState(() => window.location.hash.includes('type=recovery'))

  async function loadUserData(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').eq('id', userId).single()
    setProfile(profileData)

    const { data: businessData } = await supabase
      .from('businesses').select(BUSINESS_COLUMNS).eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (businessData) {
      setBusiness(businessData)
      setRole('owner')
      setStaffResource(null)
      return
    }

    // Sin negocio propio: puede ser un profesional que se sumó con una invitación
    const { data: membership } = await supabase
      .from('staff_members').select(`resources(id, name), businesses(${BUSINESS_COLUMNS})`)
      .eq('user_id', userId).maybeSingle()
    const staff = membership as { resources: StaffResource | null; businesses: Business | null } | null
    setBusiness(staff?.businesses ?? null)
    setRole(staff?.businesses ? 'staff' : null)
    setStaffResource(staff?.businesses ? staff.resources : null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadUserData(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(newSession)
      if (newSession) await loadUserData(newSession.user.id)
      else { setProfile(null); setBusiness(null); setRole(null); setStaffResource(null) }
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  // invite: registro desde un enlace de invitación. El token queda en la cuenta (join_token) y la base la suma al
  // equipo sola apenas se confirma el email, desde cualquier dispositivo (migración 032). redirectTo es adónde vuelve
  // el enlace del mail (si Supabase no lo permite, usa la URL del sitio).
  async function signUp(email: string, password: string, fullName: string, invite?: { token: string; redirectTo: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
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
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    return error ? error.message : null
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    return error ? error.message : null
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return error.message
    setRecovering(false)
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshBusiness() {
    if (session) await loadUserData(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, business, role, staffResource, loading, recovering, requestPasswordReset, updatePassword, signIn, signUp, resendConfirmation, signOut, refreshBusiness }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
