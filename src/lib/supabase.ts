import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local')
}

// Si se abre un enlace de mail vencido o ya usado (por ejemplo, un mail de confirmación viejo), Supabase vuelve con
// #error=access_denied&error_code=otp_expired&... en la dirección. Se lee al cargar, antes de que el cliente la limpie.
function readAuthLinkError(): 'expired' | 'other' | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search)
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null
  return code === 'otp_expired' || /expired|invalid/i.test(params.get('error_description') ?? '') ? 'expired' : 'other'
}
export const authLinkError = readAuthLinkError()

// worker: el latido del tiempo real corre en un Web Worker, así Chrome no lo frena con la pestaña en segundo plano
// y los avisos de reservas nuevas siguen llegando (ver reservationAlerts.ts).
export const supabase = createClient(url, anonKey, { realtime: { worker: true } })
