import { supabase } from './supabase'

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
  const { data: business, error } = await supabase
    .from('businesses')
    .insert({ owner_id: ownerId, name: input.name, slug: input.slug })
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

export async function getDashboardStats(businessId: string): Promise<DashboardStats> {
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

export async function listServices(businessId: string): Promise<Service[]> {
  const { data } = await supabase
    .from('services').select('*').eq('business_id', businessId).order('name')
  return data ?? []
}

export async function createService(businessId: string, svc: { name: string; duration_min: number; price: number }) {
  const { error } = await supabase.from('services').insert({ business_id: businessId, ...svc })
  return error ? error.message : null
}

export async function updateService(id: string, svc: { name: string; duration_min: number; price: number }) {
  const { error } = await supabase.from('services').update(svc).eq('id', id)
  return error ? error.message : null
}

export async function deleteService(id: string) {
  const { error } = await supabase.from('services').delete().eq('id', id)
  return error ? error.message : null
}

export async function updateBusiness(id: string, input: { name: string; slug: string }) {
  const { error } = await supabase.from('businesses').update(input).eq('id', id)
  return error ? error.message : null
}

export async function getAvailability(businessId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('availability').select('day_of_week, hour').eq('business_id', businessId)
  return new Set((data ?? []).map(r => `${r.day_of_week}-${r.hour}`))
}

export async function setAvailability(businessId: string, slots: Set<string>) {
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
