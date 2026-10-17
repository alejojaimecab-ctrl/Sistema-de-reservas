import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Profile = { id: string; full_name: string }
export type Business = { id: string; name: string; slug: string; cancel_min_hours: number }

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  business: Business | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshBusiness: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadUserData(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').eq('id', userId).single()
    setProfile(profileData)

    const { data: businessData } = await supabase
      .from('businesses').select('id, name, slug, cancel_min_hours').eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    setBusiness(businessData)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadUserData(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession) await loadUserData(newSession.user.id)
      else { setProfile(null); setBusiness(null) }
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return error.message
    if (!data.user) return 'No se pudo crear la cuenta'
    // El perfil lo crea el trigger handle_new_user en la base de datos
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshBusiness() {
    if (session) await loadUserData(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, business, loading, signIn, signUp, signOut, refreshBusiness }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
