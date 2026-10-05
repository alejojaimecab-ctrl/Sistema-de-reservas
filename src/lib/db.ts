import { supabase } from './supabase'

// Fase 6: filtro explícito del dueño en cada query (defensa en profundidad sobre RLS).
// Devuelve los ids de negocios del usuario autenticado; [] si no hay sesión.
async function ownedBusinessIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('businesses').select('id').eq('owner_id', user.id)
  return (data ?? []).map(b => b.id as string)
}

// true si el negocio pertenece al usuario autenticado
async function ownsBusiness(businessId: string): Promise<boolean> {
  return (await ownedBusinessIds()).includes(businessId)
}

export type Service = {
  id: string
  business_id: string
  name: string
  duration_min: number
  price: number
  is_active: boolean
}

export type Reservation = {
  id: string
  starts_at: string
  status: 'confirmed' | 'cancelled' | 'completed'
  clients: { name: string } | null
  services: { name: string; price: number } | null
}

export type DashboardStats = {
  todayCount: number
  monthClients: number
  attendanceRate: number | null
}

export async function createBusinessWithSetup(
  ownerId: string,
  input: {
    name: string
    slug: string
    services: Array<{ name: string; duration: number; price: number }>
    availability: Record<string, boolean[]>
  }
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ownerId) return 'La sesión no coincide con el dueño indicado'
  const { data: business, error } = await supabase
    .from('businesses')
    .insert({ owner_id: user.id, name: input.name, slug: input.slug })
    .select('id').single()
  if (error) return error.message
  const businessId = business.id as string

  if (input.services.length > 0) {
    const { error: svcError } = await supabase.from('services').insert(
      input.services
        .filter(s => s.name.trim() !== '')
        .map(s => ({ business_id: businessId, name: s.name.trim(), duration_min: s.duration || 30, price: s.price || 0 }))
    )
    if (svcError) return svcError.message
  }

  // availability: Record<dayName, boolean[24]> → filas (day_of_week 0=domingo … 6=sábado)
  const dayIndex: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6
  }
  const rows = Object.entries(input.availability).flatMap(([day, hours]) =>
    hours.flatMap((on, hour) => on ? [{ business_id: businessId, day_of_week: dayIndex[day], hour }] : [])
  )
  if (rows.length > 0) {
    const { error: avError } = await supabase.from('availability').insert(rows)
    if (avError) return avError.message
  }

  return null
}

export async function createBusiness(ownerId: string, input: { name: string; slug: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ownerId) return 'La sesión no coincide con el dueño indicado'
  const { error } = await supabase
    .from('businesses')
    .insert({ owner_id: user.id, name: input.name, slug: input.slug })
  return error ? error.message : null
}

export async function getDashboardStats(businessId: string): Promise<DashboardStats> {
  if (!(await ownsBusiness(businessId))) return { todayCount: 0, monthClients: 0, attendanceRate: null }
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [today, month, attended] = await Promise.all([
    supabase.from('reservations').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('starts_at', startOfDay).lt('starts_at', endOfDay)
      .neq('status', 'cancelled'),
    supabase.from('reservations').select('client_id')
      .eq('business_id', businessId).gte('starts_at', startOfMonth).neq('status', 'cancelled'),
    supabase.from('reservations').select('status')
      .eq('business_id', businessId).lt('starts_at', now.toISOString()),
  ])

  const monthClients = new Set((month.data ?? []).map(r => r.client_id)).size
  const past = attended.data ?? []
  const attendanceRate = past.length === 0
    ? null
    : Math.round((past.filter(r => r.status !== 'cancelled').length / past.length) * 100)

  return { todayCount: today.count ?? 0, monthClients, attendanceRate }
}

export async function listReservations(businessId: string): Promise<Reservation[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase
    .from('reservations')
    .select('id, starts_at, status, clients(name), services(name, price)')
    .eq('business_id', businessId)
    .gte('starts_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })
    .limit(10)
  return (data ?? []) as unknown as Reservation[]
}

// --- API pública (Fases 3 y 5): la usa la página de reserva sin sesión ---

export type PublicBusiness = { slug: string; name: string }
export type PublicService = {
  id: string
  business_slug: string
  name: string
  duration_min: number
  price: number
}

// MVP: la página de reserva toma el primer negocio publicado.
// Cuando haya ruta por slug (/reservar/:slug), esto pasa a buscar por slug.
// `failed` distingue "no hay negocio" de "no pudimos conectar": sin eso la UI
// mostraba el empty state ante un error de red.
export async function getFirstPublicBusiness(): Promise<{ business: PublicBusiness | null; failed: boolean }> {
  const { data, error } = await supabase.from('public_businesses').select('slug, name').limit(1)
  return { business: data?.[0] ?? null, failed: !!error }
}

export async function listPublicServices(slug: string): Promise<{ services: PublicService[]; failed: boolean }> {
  const { data, error } = await supabase
    .from('public_services').select('id, business_slug, name, duration_min, price')
    .eq('business_slug', slug).order('name')
  return { services: data ?? [], failed: !!error }
}

// Slots libres de un día para UN servicio (función security definer, Fase 8).
// Solo devuelve horarios donde entra la duración completa del servicio,
// calculados en la zona horaria del negocio. Devuelve starts_at en
// timestamptz; la UI los muestra en hora local.
export async function getPublicSlots(slug: string, serviceId: string, date: Date): Promise<{ slots: string[]; failed: boolean }> {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const { data, error } = await supabase.rpc('public_slots', {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: `${yyyy}-${mm}-${dd}`,
  })
  return { slots: (data ?? []).map((r: { starts_at: string }) => r.starts_at), failed: !!error }
}

// Mensajes que book_public (Fases 3 y 7) ya devuelve en lenguaje humano.
// Cualquier otro error (red, constraint en inglés, función faltante) se
// reemplaza por un fallback amable y el detalle queda en consola.
const BOOK_PUBLIC_KNOWN_ERRORS = [
  'El nombre es obligatorio',
  'La reserva tiene que ser a futuro',
  'Negocio no encontrado',
  'El negocio no tiene recursos configurados',
  'Servicio no disponible',
  'Ese horario no está dentro de la disponibilidad del negocio',
  'Ese horario acaba de ocuparse, elegí otro',
  'Demasiadas reservas con ese email, probá más tarde',
  'Demasiadas reservas desde esta conexión, probá más tarde',
]
const BOOK_PUBLIC_FALLBACK = 'No pudimos guardar tu reserva. Probá de nuevo en unos minutos.'

export async function bookPublic(input: {
  slug: string
  serviceId: string
  startsAt: string
  name: string
  email?: string
  phone?: string
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('book_public', {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_name: input.name,
    p_email: input.email || null,
    p_phone: input.phone || null,
  })
  if (!error) return { error: null }
  if (BOOK_PUBLIC_KNOWN_ERRORS.some(msg => error.message.includes(msg))) return { error: error.message }
  console.warn('book_public falló con un error no mapeado:', error.message)
  return { error: BOOK_PUBLIC_FALLBACK }
}

export async function listServices(businessId: string): Promise<Service[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase
    .from('services').select('*').eq('business_id', businessId).order('name')
  return data ?? []
}

export async function createService(businessId: string, svc: { name: string; duration_min: number; price: number }) {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  const { error } = await supabase.from('services').insert({ business_id: businessId, ...svc })
  return error ? error.message : null
}

export async function updateService(id: string, svc: { name: string; duration_min: number; price: number }) {
  const owned = await ownedBusinessIds()
  const { error } = await supabase.from('services').update(svc).eq('id', id).in('business_id', owned)
  return error ? error.message : null
}

export async function deleteService(id: string) {
  const owned = await ownedBusinessIds()
  const { error } = await supabase.from('services').delete().eq('id', id).in('business_id', owned)
  return error ? error.message : null
}

export async function updateBusiness(id: string, input: { name: string; slug: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'No hay sesión activa'
  const { error } = await supabase.from('businesses').update(input).eq('id', id).eq('owner_id', user.id)
  return error ? error.message : null
}

export async function getAvailability(businessId: string): Promise<Set<string>> {
  if (!(await ownsBusiness(businessId))) return new Set()
  const { data } = await supabase
    .from('availability').select('day_of_week, hour').eq('business_id', businessId)
  return new Set((data ?? []).map(r => `${r.day_of_week}-${r.hour}`))
}

export async function setAvailability(businessId: string, slots: Set<string>) {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  const { error: delError } = await supabase.from('availability').delete().eq('business_id', businessId)
  if (delError) return delError.message
  if (slots.size === 0) return null
  const rows = [...slots].map(key => {
    const [day, hour] = key.split('-').map(Number)
    return { business_id: businessId, day_of_week: day, hour }
  })
  const { error } = await supabase.from('availability').insert(rows)
  return error ? error.message : null
}
