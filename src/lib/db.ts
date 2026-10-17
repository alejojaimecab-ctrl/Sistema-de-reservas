import { supabase } from './supabase'
import { slugProblem } from './routes'

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
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  clients: { name: string } | null
  services: { name: string; price: number } | null
  resources: { name: string } | null
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
  const problem = slugProblem(input.slug)
  if (problem) return problem
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

  // Los borradores anteriores guardaban horas completas; cada una se expande
  // a dos intervalos para conservar la disponibilidad al migrar a medias horas.
  const dayIndex: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6
  }
  const rows = Object.entries(input.availability).flatMap(([day, daySlots]) => {
    const slots = daySlots.length === 24 ? daySlots.flatMap(open => [open, open]) : daySlots
    return slots.flatMap((open, slotIndex) =>
      open ? [{ business_id: businessId, day_of_week: dayIndex[day], slot_index: slotIndex }] : [],
    )
  })
  if (rows.length > 0) {
    const { error: avError } = await supabase.from('availability').insert(rows)
    if (avError) return avError.message
  }

  return null
}

export async function createBusiness(ownerId: string, input: { name: string; slug: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ownerId) return 'La sesión no coincide con el dueño indicado'
  const problem = slugProblem(input.slug)
  if (problem) return problem
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
  // Asistencia real: de los turnos que el dueño ya marcó, cuántos vinieron
  const marked = (attended.data ?? []).filter(r => r.status === 'completed' || r.status === 'no_show')
  const attendanceRate = marked.length === 0
    ? null
    : Math.round((marked.filter(r => r.status === 'completed').length / marked.length) * 100)

  return { todayCount: today.count ?? 0, monthClients, attendanceRate }
}

export async function listReservations(businessId: string): Promise<Reservation[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase
    .from('reservations')
    .select('id, starts_at, status, clients(name), services(name, price), resources(name)')
    .eq('business_id', businessId)
    .gte('starts_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })
    .limit(10)
  return (data ?? []) as unknown as Reservation[]
}

export async function listAgendaReservations(
  businessId: string,
): Promise<{ reservations: Reservation[]; error: string | null }> {
  if (!(await ownsBusiness(businessId))) {
    return { reservations: [], error: 'No se pudo validar el acceso al negocio.' }
  }

  const reservations: Reservation[] = []
  const pageSize = 500

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, starts_at, status, clients(name), services(name, price), resources(name)')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) return { reservations: [], error: error.message }

    const page = (data ?? []) as unknown as Reservation[]
    reservations.push(...page)
    if (page.length < pageSize) break
  }

  return { reservations, error: null }
}

export async function updateReservationStatus(
  id: string,
  status: Extract<Reservation['status'], 'confirmed' | 'completed' | 'no_show'>,
): Promise<string | null> {
  const owned = await ownedBusinessIds()
  if (owned.length === 0) return 'No se pudo validar el acceso al negocio.'

  const { data, error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', id)
    .in('business_id', owned)
    .select('id')
    .maybeSingle()

  if (error) return error.message
  if (!data) return 'No encontramos ese turno para actualizarlo.'
  return null
}

export async function listReservationServices(
  businessId: string,
): Promise<{ services: Service[]; error: string | null }> {
  if (!(await ownsBusiness(businessId))) {
    return { services: [], error: 'No tenés permiso sobre este negocio.' }
  }
  const { data, error } = await supabase
    .from('services')
    .select('id, business_id, name, duration_min, price, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')
  if (error) return { services: [], error: error.message }
  return { services: data ?? [], error: null }
}

export async function createOwnerReservation(input: {
  businessId: string
  serviceId: string
  startsAt: string
  name: string
  email: string
  phone?: string
  resourceId?: string | null
}): Promise<{ id: string | null; error: string | null }> {
  if (!(await ownsBusiness(input.businessId))) {
    return { id: null, error: 'No tenés permiso sobre este negocio.' }
  }
  const { data, error } = await supabase.rpc('create_owner_reservation', {
    p_business_id: input.businessId,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_name: input.name.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone?.trim() || null,
    p_resource_id: input.resourceId ?? null,
  })
  if (error) return { id: null, error: error.message }
  const result = data as { id?: string } | null
  if (!result?.id) return { id: null, error: 'No pudimos confirmar el alta de la reserva.' }
  return { id: result.id, error: null }
}

// --- API pública (Fases 3 y 5): la usa la página de reserva sin sesión ---

export type PublicBusiness = {
  slug: string
  name: string
  cancel_min_hours: number
  min_notice_hours: number
  max_advance_days: number
  phone: string | null
  address: string | null
  logo_path: string | null
}
export type PublicService = {
  id: string
  business_slug: string
  name: string
  duration_min: number
  price: number
}

// `failed` distingue "no existe ese negocio" de "no pudimos conectar": sin eso
// la UI mostraba el empty state ante un error de red.
export async function getPublicBusiness(slug: string): Promise<{ business: PublicBusiness | null; failed: boolean }> {
  const { data, error } = await supabase.from('public_businesses').select('slug, name, cancel_min_hours, min_notice_hours, max_advance_days, phone, address, logo_path').eq('slug', slug).maybeSingle()
  return { business: data ?? null, failed: !!error }
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
export type PublicProfessional = { id: string; name: string }

export async function listPublicResourceServices(slug: string): Promise<ResourceService[]> {
  const { data } = await supabase.from('public_resource_services').select('resource_id, service_id').eq('business_slug', slug)
  return data ?? []
}

export async function listPublicProfessionals(slug: string): Promise<{ professionals: PublicProfessional[]; failed: boolean }> {
  const { data, error } = await supabase
    .from('public_resources').select('id, name')
    .eq('business_slug', slug).order('created_at', { ascending: true })
  return { professionals: data ?? [], failed: !!error }
}

// resourceId null = "cualquier profesional": la base asigna el primero libre.
export async function getPublicSlots(slug: string, serviceId: string, date: Date, resourceId: string | null = null): Promise<{ slots: string[]; failed: boolean }> {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const { data, error } = await supabase.rpc('public_slots', {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: `${yyyy}-${mm}-${dd}`,
    p_resource_id: resourceId,
  })
  return { slots: (data ?? []).map((r: { starts_at: string }) => r.starts_at), failed: !!error }
}

// Mensajes que book_public (Fases 3 y 7) ya devuelve en lenguaje humano.
// Cualquier otro error (red, constraint en inglés, función faltante) se
// reemplaza por un fallback amable y el detalle queda en consola.
const BOOK_PUBLIC_KNOWN_ERRORS = [
  'El nombre es obligatorio',
  'El correo electrónico es obligatorio',
  'La reserva tiene que ser a futuro',
  'Negocio no encontrado',
  'El negocio no tiene recursos configurados',
  'Servicio no disponible',
  'Ese horario no está dentro de la disponibilidad del negocio',
  'Ese horario acaba de ocuparse, elegí otro',
  'Ese profesional no está disponible',
  'Ese día no hay atención con ese profesional',
  'Ya no se puede reservar con tan poca anticipación',
  'Todavía no se pueden reservar turnos para esa fecha',
  'Ese profesional no ofrece este servicio',
  'Demasiadas reservas con ese email, probá más tarde',
  'Demasiadas reservas desde esta conexión, probá más tarde',
]
const BOOK_PUBLIC_FALLBACK = 'No pudimos guardar tu reserva. Probá de nuevo en unos minutos.'

export async function bookPublic(input: {
  slug: string
  serviceId: string
  startsAt: string
  name: string
  email: string
  phone?: string
  resourceId?: string | null
}): Promise<{ professionalName: string | null; cancelToken: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('book_public', {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_name: input.name,
    p_email: input.email.trim(),
    p_phone: input.phone || null,
    p_resource_id: input.resourceId ?? null,
  })
  if (!error) {
    const booked = data as { resource_name?: string; cancel_token?: string } | null
    return { professionalName: booked?.resource_name ?? null, cancelToken: booked?.cancel_token ?? null, error: null }
  }
  if (BOOK_PUBLIC_KNOWN_ERRORS.some(msg => error.message.includes(msg))) return { professionalName: null, cancelToken: null, error: error.message }
  console.warn('book_public falló con un error no mapeado:', error.message)
  return { professionalName: null, cancelToken: null, error: BOOK_PUBLIC_FALLBACK }
}

// --- Cancelación ---

export type ReservationByToken = {
  business_name: string
  service_name: string
  professional_name: string
  starts_at: string
  ends_at: string
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  cancel_min_hours: number
  can_cancel: boolean
}

const CANCEL_FALLBACK = 'No pudimos procesar la cancelación. Probá de nuevo en unos minutos.'
const CANCEL_KNOWN_ERRORS = [
  'No encontramos esa reserva',
  'Ya no se puede cancelar online',
  'Este turno ya fue atendido',
  'Este turno ya pasó',
]

export async function getReservationByToken(token: string): Promise<{ reservation: ReservationByToken | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_reservation_by_token', { p_token: token })
  if (error) {
    return { reservation: null, error: error.message.includes('No encontramos esa reserva') ? 'No encontramos esa reserva. Revisá que el enlace esté completo.' : CANCEL_FALLBACK }
  }
  return { reservation: data as ReservationByToken, error: null }
}

export async function cancelReservationByToken(token: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_reservation_by_token', { p_token: token })
  if (!error) return null
  return CANCEL_KNOWN_ERRORS.some(msg => error.message.includes(msg)) ? error.message : CANCEL_FALLBACK
}

export async function cancelOwnerReservation(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_reservation_owner', { p_reservation_id: id })
  return error ? error.message : null
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

// --- Logo del negocio (Storage: bucket público business-logos, carpeta = id del negocio) ---

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const LOGO_MAX_BYTES = 1024 * 1024 // tope de lo que se guarda (el bucket lo exige también)
const LOGO_MAX_INPUT_BYTES = 10 * 1024 * 1024 // lo que se acepta antes de ajustar la imagen
const LOGO_MAX_SIDE = 512 // px del lado más largo: se muestra a 43-56 px

// Achica y comprime el logo en el navegador: una foto de celular de varios MB queda en unos KB.
async function prepareLogo(file: File): Promise<File | string> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return 'No pudimos leer esa imagen. Probá con otra.'
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // WebP conserva la transparencia; si el navegador no sabe generarlo, devuelve PNG.
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9))
  const extension = blob ? LOGO_TYPES[blob.type] : undefined
  if (!blob || !extension) return 'No pudimos procesar esa imagen. Probá con otra.'
  return new File([blob], `logo.${extension}`, { type: blob.type })
}

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/business-logos/${path}`
}

export async function uploadBusinessLogo(
  businessId: string,
  file: File,
  previousPath: string | null,
): Promise<string | null> {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  if (!LOGO_TYPES[file.type]) return 'El logo tiene que ser una imagen PNG, JPG o WebP.'
  if (file.size > LOGO_MAX_INPUT_BYTES) return 'La imagen pesa demasiado: el máximo es 10 MB.'
  const prepared = await prepareLogo(file)
  if (typeof prepared === 'string') return prepared
  if (prepared.size > LOGO_MAX_BYTES) return 'No pudimos achicar la imagen lo suficiente. Probá con otra.'
  const extension = LOGO_TYPES[prepared.type]

  // Nombre nuevo en cada subida: así nunca se ve un logo viejo cacheado.
  const path = `${businessId}/${Date.now()}.${extension}`
  const { error: uploadError } = await supabase.storage.from('business-logos').upload(path, prepared, { contentType: prepared.type })
  if (uploadError) return 'No pudimos subir el logo. Probá de nuevo.'

  const { error: updateError } = await supabase.from('businesses').update({ logo_path: path }).eq('id', businessId)
  if (updateError) {
    await supabase.storage.from('business-logos').remove([path])
    return updateError.message
  }
  if (previousPath) await supabase.storage.from('business-logos').remove([previousPath])
  return null
}

export async function removeBusinessLogo(businessId: string, currentPath: string | null): Promise<string | null> {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  const { error } = await supabase.from('businesses').update({ logo_path: null }).eq('id', businessId)
  if (error) return error.message
  if (currentPath) await supabase.storage.from('business-logos').remove([currentPath])
  return null
}

export async function updateBusiness(id: string, input: {
  name: string
  slug: string
  cancel_min_hours?: number
  min_notice_hours?: number
  max_advance_days?: number
  phone?: string | null
  address?: string | null
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'No hay sesión activa'
  const problem = slugProblem(input.slug)
  if (problem) return problem
  const { error } = await supabase.from('businesses').update(input).eq('id', id).eq('owner_id', user.id)
  return error ? error.message : null
}

// --- Días libres (feriados y vacaciones) ---

export type TimeOff = { id: string; resource_id: string | null; starts_on: string; ends_on: string; reason: string | null }

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function listTimeOff(businessId: string): Promise<TimeOff[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase.from('time_off').select('id, resource_id, starts_on, ends_on, reason')
    .eq('business_id', businessId).gte('ends_on', dayKey(new Date())).order('starts_on', { ascending: true })
  return data ?? []
}

export async function createTimeOff(
  businessId: string,
  input: { resourceId: string | null; startsOn: string; endsOn: string; reason: string },
): Promise<{ affected: number; error: string | null }> {
  if (!(await ownsBusiness(businessId))) return { affected: 0, error: 'No tenés permiso sobre este negocio' }
  if (!input.startsOn || !input.endsOn) return { affected: 0, error: 'Elegí desde y hasta qué día.' }
  if (input.endsOn < input.startsOn) return { affected: 0, error: 'El último día no puede ser anterior al primero.' }
  const { error } = await supabase.from('time_off').insert({
    business_id: businessId,
    resource_id: input.resourceId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    reason: input.reason.trim() || null,
  })
  if (error) return { affected: 0, error: error.message }

  // Los turnos ya reservados en esos días no se cancelan solos: avisamos cuántos son.
  const from = new Date(`${input.startsOn}T00:00:00`)
  const to = new Date(`${input.endsOn}T00:00:00`)
  to.setDate(to.getDate() + 1)
  let query = supabase.from('reservations').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'confirmed')
    .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString())
  if (input.resourceId) query = query.eq('resource_id', input.resourceId)
  const { count } = await query
  return { affected: count ?? 0, error: null }
}

export async function deleteTimeOff(id: string): Promise<string | null> {
  const owned = await ownedBusinessIds()
  const { error } = await supabase.from('time_off').delete().eq('id', id).in('business_id', owned)
  return error ? error.message : null
}

// --- Profesionales (resources): cada uno con su propia disponibilidad y agenda ---

export type Professional = { id: string; name: string; is_active: boolean }

export async function listProfessionals(businessId: string): Promise<Professional[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase
    .from('resources').select('id, name, is_active')
    .eq('business_id', businessId).order('created_at', { ascending: true })
  return data ?? []
}

export async function createProfessional(businessId: string, name: string): Promise<{ id: string | null; error: string | null }> {
  if (!(await ownsBusiness(businessId))) return { id: null, error: 'No tenés permiso sobre este negocio' }
  if (!name.trim()) return { id: null, error: 'Escribí el nombre del profesional.' }
  const { data, error } = await supabase
    .from('resources').insert({ business_id: businessId, name: name.trim() }).select('id').single()
  return error ? { id: null, error: error.message } : { id: data.id as string, error: null }
}

export async function updateProfessional(
  id: string,
  changes: { name?: string; is_active?: boolean },
): Promise<string | null> {
  const owned = await ownedBusinessIds()
  if (changes.name !== undefined && !changes.name.trim()) return 'Escribí el nombre del profesional.'
  const patch = changes.name !== undefined ? { ...changes, name: changes.name.trim() } : changes
  const { data, error } = await supabase
    .from('resources').update(patch).eq('id', id).in('business_id', owned).select('id').maybeSingle()
  if (error) return error.message
  return data ? null : 'No encontramos ese profesional.'
}

// Qué servicios ofrece cada profesional (resource_services)
export type ResourceService = { resource_id: string; service_id: string }

export async function listResourceServices(businessId: string): Promise<ResourceService[]> {
  if (!(await ownsBusiness(businessId))) return []
  const { data } = await supabase.from('resource_services').select('resource_id, service_id').eq('business_id', businessId)
  return data ?? []
}

export async function setProfessionalServices(businessId: string, resourceId: string, serviceIds: string[]): Promise<string | null> {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  const { data, error } = await supabase.from('resource_services').select('service_id').eq('resource_id', resourceId)
  if (error) return error.message
  const current = new Set((data ?? []).map(row => row.service_id as string))
  const wanted = new Set(serviceIds)
  const toAdd = serviceIds.filter(id => !current.has(id))
  const toRemove = [...current].filter(id => !wanted.has(id))
  if (toAdd.length > 0) {
    const { error: addError } = await supabase.from('resource_services')
      .insert(toAdd.map(serviceId => ({ resource_id: resourceId, service_id: serviceId, business_id: businessId })))
    if (addError) return addError.message
  }
  if (toRemove.length > 0) {
    const { error: removeError } = await supabase.from('resource_services')
      .delete().eq('resource_id', resourceId).in('service_id', toRemove)
    if (removeError) return removeError.message
  }
  return null
}

export async function getAvailability(businessId: string, resourceId: string): Promise<Set<string>> {
  if (!(await ownsBusiness(businessId))) return new Set()
  const { data } = await supabase
    .from('availability').select('day_of_week, slot_index')
    .eq('business_id', businessId).eq('resource_id', resourceId)
  return new Set((data ?? []).map(r => `${r.day_of_week}-${r.slot_index}`))
}

// Guarda solo las diferencias (no borra todo y reinserta): con guardado automático,
// un corte a mitad de camino no puede dejar a un profesional sin horarios.
export async function setAvailability(businessId: string, resourceId: string, slots: Set<string>) {
  if (!(await ownsBusiness(businessId))) return 'No tenés permiso sobre este negocio'
  const current = await getAvailability(businessId, resourceId)
  const toAdd = [...slots].filter(key => !current.has(key))
  const toRemove = [...current].filter(key => !slots.has(key))

  const removeByDay = new Map<number, number[]>()
  for (const key of toRemove) {
    const [day, slotIndex] = key.split('-').map(Number)
    removeByDay.set(day, [...(removeByDay.get(day) ?? []), slotIndex])
  }
  for (const [day, slotIndexes] of removeByDay) {
    const { error } = await supabase.from('availability').delete()
      .eq('business_id', businessId).eq('resource_id', resourceId)
      .eq('day_of_week', day).in('slot_index', slotIndexes)
    if (error) return error.message
  }

  if (toAdd.length === 0) return null
  const rows = toAdd.map(key => {
    const [day, slotIndex] = key.split('-').map(Number)
    return { business_id: businessId, resource_id: resourceId, day_of_week: day, slot_index: slotIndex }
  })
  const { error } = await supabase.from('availability').insert(rows)
  return error ? error.message : null
}
