import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bell, CalendarDays, CalendarOff, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, DollarSign, Ellipsis, LayoutDashboard, LogOut, Mail, Phone, Plus, Settings2, Sparkles, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import { Brand } from './Brand'
import { formatPrice } from '../data/demo'
import { useAuth } from '../lib/auth'
import { bookingUrl, slugify } from '../lib/routes'
import { TeamSection } from './TeamSection'
import { TimeOffSection } from './TimeOffSection'
import type { AvailabilityDay } from './AvailabilityEditor'
import {
  cancelOwnerReservation, createBusiness, createBusinessWithSetup, createOwnerReservation, createService, deleteService, getDashboardStats, getPublicSlots,
  listAgendaReservations, listReservationServices, listReservations, listServices, updateBusiness, updateReservationStatus, updateService,
  listProfessionals, listResourceServices, type DashboardStats, type Professional, type Reservation, type ResourceService, type Service,
} from '../lib/db'

type OwnerDashboardProps = { onExit: () => void }

const sections = ['Resumen', 'Agenda', 'Reservas', 'Servicios', 'Equipo', 'Días libres', 'Configuración']
const sectionIcons = [LayoutDashboard, CalendarDays, UsersRound, Sparkles, UserRound, CalendarOff, Settings2]

const days: AvailabilityDay[] = [
  { id: '1', name: 'Lunes' }, { id: '2', name: 'Martes' }, { id: '3', name: 'Miércoles' },
  { id: '4', name: 'Jueves' }, { id: '5', name: 'Viernes' }, { id: '6', name: 'Sábado' }, { id: '0', name: 'Domingo' },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buen día'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

export function OwnerDashboard({ onExit }: OwnerDashboardProps) {
  const { profile, business, signOut, refreshBusiness } = useAuth()
  const [active, setActive] = useState('Resumen')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([])
  const [agendaLoading, setAgendaLoading] = useState(true)
  const [agendaError, setAgendaError] = useState<string | null>(null)
  const [showNewReservation, setShowNewReservation] = useState(false)
  const [reservationNotice, setReservationNotice] = useState<string | null>(null)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [cancelNotice, setCancelNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const activeProfessionals = professionals.filter(p => p.is_active)
  const reloadProfessionals = async () => {
    if (business) setProfessionals(await listProfessionals(business.id))
  }

  async function cancelReservation(reservation: Reservation) {
    if (!business) return
    const who = reservation.clients?.name ?? 'el cliente'
    if (!window.confirm(`¿Cancelar el turno de ${who}? El horario va a quedar libre.`)) return
    setCancelNotice(null)
    const cancelError = await cancelOwnerReservation(reservation.id)
    if (cancelError) { setCancelNotice({ text: `No pudimos cancelar el turno: ${cancelError}`, isError: true }); return }
    setUpcomingReservations(current => current.filter(item => item.id !== reservation.id))
    void listReservations(business.id).then(setReservations)
    void getDashboardStats(business.id).then(setStats)
    setCancelNotice({ text: `Cancelaste el turno de ${who}.`, isError: false })
  }

  useEffect(() => {
    if (!business) return
    void reloadProfessionals()
    getDashboardStats(business.id).then(setStats)
    listReservations(business.id).then(setReservations)
    let active = true
    setAgendaLoading(true)
    setAgendaError(null)
    setUpcomingReservations([])
    listAgendaReservations(business.id)
      .then(result => {
        if (!active) return
        setUpcomingReservations(result.reservations)
        setAgendaError(result.error)
      })
      .catch(loadError => {
        if (!active) return
        setAgendaError(loadError instanceof Error ? loadError.message : 'No pudimos cargar los próximos turnos.')
      })
      .finally(() => {
        if (active) setAgendaLoading(false)
      })
    return () => { active = false }
  }, [business])

  if (!business) {
    return <div className="dashboard">
      <aside className="dashboard-sidebar"><Brand />
        <div className="business-switch">
          <span className="mini-logo">{profile ? initials(profile.full_name) : '…'}</span>
          <span><strong>{profile?.full_name ?? 'Mi cuenta'}</strong><small>Sin negocio todavía</small></span>
        </div>
        <button className="sidebar-exit" onClick={() => { void signOut(); onExit() }}><LogOut size={17} /> Cerrar sesión</button>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div><p className="eyebrow">{todayLabel()}</p><h1>{greeting()}, {profile?.full_name ?? 'bienvenido'} <span>✦</span></h1></div>
        </header>
        <CreateBusinessCard />
      </main>
    </div>
  }

  return <div className="dashboard">
    <aside className="dashboard-sidebar"><Brand />
      <div className="business-switch">
        <span className="mini-logo">{initials(business.name)}</span>
        <span><strong>{business.name}</strong><small>{window.location.host}/{business.slug}</small></span>
        <CopyLinkButton slug={business.slug} />
      </div>
      <nav>{sections.map((item, index) => { const Icon = sectionIcons[index]; return <button className={active === item ? 'is-active' : ''} key={item} onClick={() => setActive(item)}><Icon size={18} />{item}</button> })}</nav>
      <button className="sidebar-exit" onClick={() => { void signOut(); onExit() }}><LogOut size={17} /> Cerrar sesión</button>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-header">
        <div><p className="eyebrow">{todayLabel()}</p><h1>{greeting()}, {profile?.full_name ?? 'bienvenido'} <span>✦</span></h1></div>
        <div className="header-actions"><button className="icon-button" aria-label="Notificaciones"><Bell size={19} /><i /></button></div>
      </header>

      {cancelNotice && <p className={cancelNotice.isError ? 'calendar-message calendar-message--error' : 'reservation-form-success'} role={cancelNotice.isError ? 'alert' : 'status'}>{cancelNotice.text}</p>}

      {active === 'Resumen' && <>
        <section className="dashboard-stats">
          <Metric icon={<CalendarDays size={19} />} label="Turnos para hoy" value={String(stats?.todayCount ?? 0)} detail="Reservas confirmadas" />
          <Metric icon={<UsersRound size={19} />} label="Clientes este mes" value={String(stats?.monthClients ?? 0)} detail="Clientes únicos con turno" />
          <Metric icon={<CheckCircle2 size={19} />} label="Tasa de asistencia" value={stats?.attendanceRate == null ? '—' : `${stats.attendanceRate}%`} detail="Sobre los turnos que marcaste" />
        </section>
        <section className="dashboard-grid"><div className="agenda-card">
          <div className="card-heading"><div><p className="eyebrow">Tu agenda</p><h2>Próximas reservas</h2></div><button className="link-button" onClick={() => setActive('Reservas')}>Ver todas</button></div>
          <ReservationList reservations={reservations} showProfessional={activeProfessionals.length > 1} onCancel={cancelReservation} />
        </div></section>
      </>}

      {active === 'Agenda' && (
        <AgendaCalendar
          reservations={upcomingReservations}
          showProfessional={activeProfessionals.length > 1}
          onCancel={cancelReservation}
          loading={agendaLoading}
          error={agendaError}
          onStatusChange={(id, status) => setUpcomingReservations(current =>
            current.map(reservation => reservation.id === id ? { ...reservation, status } : reservation),
          )}
        />
      )}

      {active === 'Reservas' && (
        <section className="agenda-card">
          <div className="card-heading"><div><p className="eyebrow">Reservas</p><h2>Próximas reservas</h2></div>{!showNewReservation && <button type="button" className="button button--primary button--small" onClick={() => { setReservationNotice(null); setShowNewReservation(true) }}><Plus size={15} /> Nueva reserva</button>}</div>
          {showNewReservation && <ManualReservationForm
            businessId={business.id}
            businessSlug={business.slug}
            professionals={activeProfessionals}
            onCancel={() => setShowNewReservation(false)}
            onCreated={reservation => {
              setReservations(current => [...current, reservation].sort((a, b) =>
                new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
              ).slice(0, 10))
              setUpcomingReservations(current => [...current, reservation].sort((a, b) =>
                new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
              ))
              setReservationNotice('La reserva se agregó correctamente.')
              setShowNewReservation(false)
              void getDashboardStats(business.id).then(setStats)
            }}
          />}
          {reservationNotice && <p className="reservation-form-success" role="status">{reservationNotice}</p>}
          <ReservationList reservations={reservations} showProfessional={activeProfessionals.length > 1} onCancel={cancelReservation} />
        </section>
      )}

      {active === 'Servicios' && <ServicesSection businessId={business.id} />}
      {active === 'Días libres' && <TimeOffSection businessId={business.id} professionals={professionals} />}
      {active === 'Equipo' && <TeamSection businessId={business.id} days={days} professionals={professionals} onChanged={reloadProfessionals} />}
      {active === 'Configuración' && <ConfigSection businessId={business.id} onSaved={refreshBusiness} />}
    </main>
  </div>
}

type PendingSetup = {
  name: string
  slug: string
  services: Array<{ name: string; duration: number; price: number }>
  availability: Record<string, boolean[]>
}

type PendingSetupRead = { pending: PendingSetup | null; error: string | null }

function isPendingSetup(value: unknown): value is PendingSetup {
  if (!value || typeof value !== 'object') return false
  const setup = value as Record<string, unknown>
  if (
    typeof setup.name !== 'string'
    || !setup.name.trim()
    || typeof setup.slug !== 'string'
    || !setup.slug.trim()
    || !Array.isArray(setup.services)
    || !setup.services.length
    || !setup.availability
    || typeof setup.availability !== 'object'
  ) return false

  const validServices = setup.services.every(service => {
    if (!service || typeof service !== 'object') return false
    const item = service as Record<string, unknown>
    return typeof item.name === 'string'
      && Boolean(item.name.trim())
      && typeof item.duration === 'number'
      && Number.isInteger(item.duration)
      && item.duration >= 5
      && item.duration % 5 === 0
      && typeof item.price === 'number'
      && Number.isFinite(item.price)
      && item.price >= 0
  })
  const availability = setup.availability as Record<string, unknown>
  const dayIds = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
  const validAvailability = dayIds.every(day => {
    const hours = availability[day]
    return Array.isArray(hours)
      && (hours.length === 24 || hours.length === 48)
      && hours.every(hour => typeof hour === 'boolean')
  }) && Object.values(availability).some(hours =>
    Array.isArray(hours) && hours.some(hour => hour === true),
  )

  return validServices && validAvailability
}

function readPendingSetup(): PendingSetupRead {
  try {
    const raw = localStorage.getItem('reser-pending-setup')
    if (!raw) return { pending: null, error: null }

    const parsed: unknown = JSON.parse(raw)
    if (!isPendingSetup(parsed)) {
      return { pending: null, error: 'Los datos guardados están incompletos o dañados.' }
    }
    return { pending: parsed, error: null }
  } catch (readError) {
    console.warn('No se pudo recuperar la configuración pendiente:', readError)
    return {
      pending: null,
      error: readError instanceof SyntaxError
        ? 'Los datos guardados no tienen un formato válido.'
        : 'No se pudo acceder a los datos guardados en este dispositivo.',
    }
  }
}

function CreateBusinessCard() {
  const { session, refreshBusiness } = useAuth()
  const [pendingState, setPendingState] = useState(readPendingSetup)
  const pending = pendingState.pending
  const [name, setName] = useState(pending?.name ?? '')
  const [slug, setSlug] = useState(pending?.slug ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function discardPendingSetup() {
    try {
      localStorage.removeItem('reser-pending-setup')
      setPendingState({ pending: null, error: null })
      setName('')
      setSlug('')
    } catch (discardError) {
      console.error('No se pudo descartar la configuración pendiente:', discardError)
      setPendingState({ pending: null, error: 'No se pudieron descartar los datos guardados. Volvé a intentar.' })
    }
  }

  async function create() {
    setError(null)
    if (pendingState.error) return
    if (!name.trim() || !slug.trim()) { setError('Completá el nombre y el enlace de tu negocio.'); return }
    if (!session) { setError('Tu sesión expiró. Volvé a iniciar sesión.'); return }
    setBusy(true)
    const input = { name: name.trim(), slug: slugify(slug) }
    let err: string | null
    try {
      err = pending
        ? await createBusinessWithSetup(session.user.id, { ...input, services: pending.services, availability: pending.availability })
        : await createBusiness(session.user.id, input)
    } catch (createError) {
      setBusy(false)
      const detail = createError instanceof Error ? createError.message : 'error inesperado'
      setError(`No pudimos crear el negocio: ${detail}. Tus datos siguen guardados; volvé a intentar.`)
      return
    }
    setBusy(false)
    if (err) { setError(err.includes('duplicate') ? 'Ese enlace ya está en uso. Elegí otro.' : err); return }
    try {
      localStorage.removeItem('reser-pending-setup')
    } catch (storageError) {
      const detail = storageError instanceof Error ? storageError.message : 'error inesperado'
      console.error('El negocio se creó, pero no se pudieron borrar los datos pendientes:', detail)
    }
    await refreshBusiness()
  }

  return <section className="agenda-card" style={{ maxWidth: 520 }}>
    <div className="card-heading"><div><p className="eyebrow">Primer paso</p><h2>Creá tu negocio</h2></div></div>
    <p style={{ color: '#7a919c', fontSize: 14, margin: '0 0 16px' }}>
      {pending
        ? 'Recuperamos los servicios y horarios que cargaste al registrarte. Confirmá el nombre y el enlace para dejar todo listo.'
        : 'Solo necesitás el nombre y tu enlace. Los servicios y horarios los cargás después desde las secciones del panel.'}
    </p>
    {pendingState.error && (
      <div className="form-error" role="alert">
        <p>No pudimos recuperar los datos de tu configuración: {pendingState.error}</p>
        <button type="button" className="text-button" onClick={discardPendingSetup}>Descartar datos guardados</button>
      </div>
    )}
    <label className="onboarding-field">Nombre del negocio
      <input placeholder="Ej: Peluquería López" value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>reser.com.ar/</span><input placeholder="tu-negocio" value={slug} onChange={e => setSlug(e.target.value)} /></div>
    </label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button--primary" style={{ marginTop: 8 }} disabled={busy || Boolean(pendingState.error)} onClick={() => void create()}>
      {busy ? 'Creando…' : 'Crear mi negocio'}
    </button>
  </section>
}

function ReservationList({ reservations, showProfessional, onCancel }: { reservations: Reservation[]; showProfessional: boolean; onCancel: (reservation: Reservation) => void }) {
  if (reservations.length === 0) {
    return <p style={{ color: '#7a919c', fontSize: 13, padding: '12px 0' }}>Todavía no hay reservas. Las que lleguen desde tu enlace o agregues manualmente van a aparecer acá.</p>
  }
  const colors = ['blue', 'violet', 'orange']
  return <div className="agenda-list">{reservations.map((r, index) => {
    const date = new Date(r.starts_at)
    const clientName = r.clients?.name ?? 'Cliente'
    return <motion.div className="reservation-row" key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
      <time>{date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time>
      <span className={`avatar avatar--${colors[index % colors.length]}`}>{initials(clientName)}</span>
      <span className="reservation-info"><strong>{clientName}</strong><small>{r.services?.name ?? 'Servicio'}{showProfessional && r.resources ? ` · con ${r.resources.name}` : ''}</small></span>
      <b>{r.services ? formatPrice(Number(r.services.price)) : ''}</b>
      <button type="button" aria-label={`Cancelar turno de ${clientName}`} title="Cancelar turno" onClick={() => onCancel(r)}><X size={17} /></button>
    </motion.div>
  })}</div>
}

function ManualReservationForm({
  businessId,
  businessSlug,
  professionals,
  onCancel,
  onCreated,
}: {
  businessId: string
  businessSlug: string
  professionals: Professional[]
  onCancel: () => void
  onCreated: (reservation: Reservation) => void
}) {
  const [services, setServices] = useState<Service[]>([])
  const [serviceId, setServiceId] = useState('')
  const [resourceId, setResourceId] = useState('') // '' = cualquier profesional
  const [offers, setOffers] = useState<ResourceService[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState(() => localDateInputValue(new Date()))
  const [slots, setSlots] = useState<string[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsFailed, setSlotsFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retrySlots, setRetrySlots] = useState(0)

  useEffect(() => {
    let active = true
    listReservationServices(businessId).then(result => {
      if (!active) return
      setServices(result.services)
      setError(result.error)
      setServiceId(result.services[0]?.id ?? '')
    }).catch(loadError => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar los servicios.')
    }).finally(() => {
      if (active) setLoadingServices(false)
    })
    return () => { active = false }
  }, [businessId])

  useEffect(() => {
    listResourceServices(businessId).then(setOffers).catch(() => setOffers([]))
  }, [businessId])

  // Solo los profesionales que ofrecen el servicio elegido
  const serviceProfessionals = professionals.filter(p =>
    offers.some(o => o.resource_id === p.id && o.service_id === serviceId))
  useEffect(() => {
    if (resourceId && !serviceProfessionals.some(p => p.id === resourceId)) setResourceId('')
  }, [serviceProfessionals.map(p => p.id).join(','), resourceId])

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([])
      setStartsAt('')
      return
    }
    let active = true
    setError(null)
    setLoadingSlots(true)
    setSlotsFailed(false)
    setStartsAt('')
    getPublicSlots(businessSlug, serviceId, new Date(`${date}T12:00:00`), resourceId || null)
      .then(result => {
        if (!active) return
        setSlots(result.slots)
        setSlotsFailed(result.failed)
      })
      .catch(loadError => {
        if (!active) return
        setSlots([])
        setSlotsFailed(true)
        setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar los horarios disponibles.')
      })
      .finally(() => {
        if (active) setLoadingSlots(false)
      })
    return () => { active = false }
  }, [businessSlug, serviceId, resourceId, date, retrySlots])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedService = services.find(service => service.id === serviceId)
    if (!selectedService || !startsAt) return
    setSaving(true)
    setError(null)
    try {
      const result = await createOwnerReservation({
        businessId,
        serviceId,
        startsAt,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        resourceId: resourceId || null,
      })
      if (result.error || !result.id) {
        setError(result.error ?? 'No pudimos guardar la reserva.')
        return
      }
      onCreated({
        id: result.id,
        starts_at: startsAt,
        status: 'confirmed',
        clients: { name: name.trim() },
        services: { name: selectedService.name, price: selectedService.price },
        resources: professionals.find(p => p.id === resourceId) ? { name: professionals.find(p => p.id === resourceId)!.name } : null,
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No pudimos guardar la reserva.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="manual-reservation-form" onSubmit={event => void submit(event)}>
      <div className="manual-reservation-heading">
        <div><h3>Agregar reserva</h3><p>Completá los datos del cliente y elegí un horario disponible.</p></div>
        <button type="button" className="manual-reservation-close" aria-label="Cerrar formulario" onClick={onCancel}><X size={17} /></button>
      </div>
      {loadingServices ? (
        <p className="manual-reservation-message" role="status">Cargando servicios…</p>
      ) : services.length === 0 ? (
        <div className="manual-reservation-message">
          <p>{error ?? 'Todavía no hay servicios activos para reservar.'}</p>
          <button type="button" className="link-button" onClick={onCancel}>Cerrar</button>
        </div>
      ) : (
        <>
          <div className="manual-reservation-fields">
            <label>
              <span>Nombre del cliente</span>
              <div><UserRound size={16} /><input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></div>
            </label>
            <label>
              <span>Correo electrónico</span>
              <div><Mail size={16} /><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
            </label>
            <label>
              <span>Teléfono <small>(opcional)</small></span>
              <div><Phone size={16} /><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></div>
            </label>
            <label>
              <span>Servicio</span>
              <select required value={serviceId} onChange={event => setServiceId(event.target.value)}>
                {services.map(service => <option key={service.id} value={service.id}>{service.name} · {service.duration_min} min · {formatPrice(Number(service.price))}</option>)}
              </select>
            </label>
            {serviceProfessionals.length > 1 && <label>
              <span>Profesional</span>
              <select value={resourceId} onChange={event => setResourceId(event.target.value)}>
                <option value="">Cualquiera disponible</option>
                {serviceProfessionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>}
            <label>
              <span>Fecha</span>
              <input type="date" required min={localDateInputValue(new Date())} value={date} onChange={event => setDate(event.target.value)} />
            </label>
            <label>
              <span>Horario disponible</span>
              <select required value={startsAt} onChange={event => setStartsAt(event.target.value)} disabled={loadingSlots || slotsFailed || slots.length === 0}>
                <option value="">{loadingSlots ? 'Buscando horarios…' : slotsFailed ? 'No pudimos cargar' : slots.length ? 'Elegí un horario' : 'Sin horarios disponibles'}</option>
                {slots.map(slot => <option key={slot} value={slot}>{new Date(slot).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</option>)}
              </select>
            </label>
          </div>
          {slotsFailed && <p className="manual-reservation-error" role="alert">No pudimos consultar la disponibilidad. <button type="button" className="link-button" onClick={() => { setError(null); setRetrySlots(count => count + 1) }}>Reintentar</button></p>}
          {error && !slotsFailed && <p className="manual-reservation-error" role="alert">{error}</p>}
          {!loadingSlots && !slotsFailed && slots.length === 0 && <p className="manual-reservation-message">No hay horarios disponibles para ese servicio y fecha. Probá con otro día.</p>}
          <div className="manual-reservation-actions">
            <button type="button" className="button button--secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="submit" className="button button--primary" disabled={saving || loadingSlots || !startsAt}>
              {saving ? 'Guardando…' : <><Plus size={16} /> Crear reserva</>}
            </button>
          </div>
        </>
      )}
    </form>
  )
}

function localDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type CalendarMode = 'week' | 'month'

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function weekDates(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

function monthDates(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const totalDays = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const start = addDays(first, -mondayOffset)
  return Array.from({ length: totalDays }, (_, index) => addDays(start, index))
}

function moveMonth(date: Date, amount: number) {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(date.getDate(), lastDay))
}

function calendarMonthLabel(date: Date) {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function calendarWeekLabel(dates: Date[]) {
  const first = dates[0]
  const last = dates[6]
  const firstMonth = first.toLocaleDateString('es-AR', { month: 'short' })
  const lastMonth = last.toLocaleDateString('es-AR', { month: 'short' })
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${lastMonth} ${last.getFullYear()}`
    : `${first.getDate()} ${firstMonth} – ${last.getDate()} ${lastMonth} ${last.getFullYear()}`
}

function AgendaCalendar({ reservations, showProfessional, onCancel, loading, error, onStatusChange }: {
  reservations: Reservation[]
  showProfessional: boolean
  onCancel: (reservation: Reservation) => void
  loading: boolean
  error: string | null
  onStatusChange: (id: string, status: Extract<Reservation['status'], 'confirmed' | 'completed' | 'no_show'>) => void
}) {
  const [mode, setMode] = useState<CalendarMode>('week')
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(() => new Set())
  const [attendanceError, setAttendanceError] = useState<string | null>(null)
  const today = new Date()
  const dates = mode === 'week' ? weekDates(selectedDate) : monthDates(selectedDate)
  const reservationsByDate = new Map<string, Reservation[]>()

  reservations.forEach(reservation => {
    const key = dateKey(new Date(reservation.starts_at))
    const dayReservations = reservationsByDate.get(key) ?? []
    dayReservations.push(reservation)
    reservationsByDate.set(key, dayReservations)
  })

  const selectedReservations = reservationsByDate.get(dateKey(selectedDate)) ?? []
  const visibleReservations = dates.reduce((total, date) =>
    total + (reservationsByDate.get(dateKey(date))?.length ?? 0), 0)
  const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const heading = mode === 'week' ? calendarWeekLabel(dates) : calendarMonthLabel(selectedDate)
  const shiftCalendar = (direction: number) => {
    setSelectedDate(current => mode === 'week' ? addDays(current, direction * 7) : moveMonth(current, direction))
  }
  async function toggleAttendance(reservation: Reservation, target: 'completed' | 'no_show' = 'completed') {
    const previousStatus = reservation.status === 'completed' || reservation.status === 'no_show' ? reservation.status : 'confirmed'
    const nextStatus = previousStatus === target ? 'confirmed' : target
    const clientName = reservation.clients?.name ?? 'Cliente'
    setAttendanceError(null)
    setPendingAttendance(current => new Set(current).add(reservation.id))
    onStatusChange(reservation.id, nextStatus)
    try {
      const updateError = await updateReservationStatus(reservation.id, nextStatus)
      if (updateError) {
        onStatusChange(reservation.id, previousStatus)
        setAttendanceError(`No pudimos actualizar el turno de ${clientName}: ${updateError}`)
      }
    } catch (updateError) {
      onStatusChange(reservation.id, previousStatus)
      setAttendanceError(`No pudimos actualizar el turno de ${clientName}: ${updateError instanceof Error ? updateError.message : 'Ocurrió un error inesperado.'}`)
    } finally {
      setPendingAttendance(current => {
        const next = new Set(current)
        next.delete(reservation.id)
        return next
      })
    }
  }

  return (
    <section className="agenda-card calendar-card">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>{mode === 'week' ? 'Tu semana, de un vistazo' : 'Tu mes, de un vistazo'}</h2>
        </div>
        <div className="calendar-mode" role="group" aria-label="Vista del calendario">
          <button type="button" aria-pressed={mode === 'week'} className={mode === 'week' ? 'is-active' : ''} onClick={() => setMode('week')}>Semana</button>
          <button type="button" aria-pressed={mode === 'month'} className={mode === 'month' ? 'is-active' : ''} onClick={() => setMode('month')}>Mes</button>
        </div>
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button type="button" aria-label={mode === 'week' ? 'Semana anterior' : 'Mes anterior'} onClick={() => shiftCalendar(-1)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label={mode === 'week' ? 'Semana siguiente' : 'Mes siguiente'} onClick={() => shiftCalendar(1)}><ChevronRight size={18} /></button>
          <h3>{heading}</h3>
        </div>
        <button type="button" className="calendar-today" onClick={() => setSelectedDate(new Date())}>Hoy</button>
      </div>

      {error ? (
        <p className="calendar-message calendar-message--error" role="alert">No pudimos cargar los turnos: {error}</p>
      ) : (
        <>
          <div className={`calendar-grid calendar-grid--${mode}`}>
            <div className="calendar-weekdays">
              {weekdays.map(day => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-days">
              {dates.map(date => {
                const key = dateKey(date)
                const dayReservations = reservationsByDate.get(key) ?? []
                const completedCount = dayReservations.filter(reservation => reservation.status === 'completed').length
                const isCurrentMonth = date.getMonth() === selectedDate.getMonth()
                const isSelected = key === dateKey(selectedDate)
                const isToday = key === dateKey(today)

                return (
                  <button
                    type="button"
                    key={key}
                    className={`calendar-day${isCurrentMonth ? '' : ' is-outside'}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${dayReservations.length ? ' has-reservations' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`${date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${dayReservations.length} ${dayReservations.length === 1 ? 'turno' : 'turnos'}${completedCount ? `, ${completedCount} atendidos` : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    {mode === 'week' && <span className="calendar-day-weekday">{date.toLocaleDateString('es-AR', { weekday: 'short' })}</span>}
                    <span className="calendar-day-number">{date.getDate()}</span>
                    {mode === 'week' ? (
                      <span className="calendar-day-events">
                        {dayReservations.slice(0, 3).map(reservation => (
                          <span className={`calendar-week-event${reservation.status === 'completed' ? ' is-completed' : ''}`} key={reservation.id}>
                            <time>{new Date(reservation.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time>
                            <span>{reservation.clients?.name ?? 'Cliente'}</span>
                          </span>
                        ))}
                        {dayReservations.length > 3 && <span className="calendar-more">+{dayReservations.length - 3} más</span>}
                        {dayReservations.length === 0 && <span className="calendar-free">Libre</span>}
                        {completedCount > 0 && <span className="calendar-completed-count">{completedCount} atendidos</span>}
                      </span>
                    ) : (
                      <span className="calendar-month-events">
                        {dayReservations.slice(0, 2).map(reservation => (
                          <span className={`calendar-month-event${reservation.status === 'completed' ? ' is-completed' : ''}`} key={reservation.id}>
                            {new Date(reservation.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            <span>{reservation.clients?.name ?? 'Cliente'}</span>
                          </span>
                        ))}
                        {dayReservations.length > 2 && <span className="calendar-more">+{dayReservations.length - 2} más</span>}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="calendar-day-detail" aria-live="polite">
            <div className="calendar-detail-heading">
              <div>
                <p className="eyebrow">{loading ? 'Cargando agenda' : `${selectedReservations.length} ${selectedReservations.length === 1 ? 'turno' : 'turnos'}`}</p>
                <h3>{selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              </div>
              {visibleReservations > 0 && <span>{visibleReservations} en {mode === 'week' ? 'la semana' : 'el mes'}</span>}
            </div>

            {attendanceError && <p className="calendar-message calendar-message--error" role="alert">{attendanceError}</p>}

            {loading ? (
              <p className="calendar-message" role="status">Cargando tus turnos…</p>
            ) : selectedReservations.length > 0 ? (
              <div className="calendar-appointments">
                {selectedReservations.map(reservation => {
                  const date = new Date(reservation.starts_at)
                  const clientName = reservation.clients?.name ?? 'Cliente'
                  const isCompleted = reservation.status === 'completed'
                  const isNoShow = reservation.status === 'no_show'
                  const canMarkAttended = date.getTime() <= Date.now()
                  return (
                    <article className={`calendar-appointment${isCompleted ? ' is-completed' : ''}${isNoShow ? ' is-noshow' : ''}`} key={reservation.id}>
                      <time>{date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time>
                      <span className="calendar-appointment-marker" aria-hidden="true" />
                      <div>
                        <strong>{clientName}</strong>
                        <span>{reservation.services?.name ?? 'Servicio'}{showProfessional && reservation.resources ? ` · con ${reservation.resources.name}` : ''}</span>
                      </div>
                      {reservation.services && <b>{formatPrice(Number(reservation.services.price))}</b>}
                      <div className="calendar-actions">
                      <button
                        type="button"
                        className="calendar-attendance"
                        aria-label={isCompleted ? `Desmarcar como atendido: ${clientName}` : `Marcar como atendido: ${clientName}`}
                        aria-pressed={isCompleted}
                        disabled={pendingAttendance.has(reservation.id) || (!isCompleted && !canMarkAttended)}
                        onClick={() => void toggleAttendance(reservation)}
                      >
                        <Check size={14} />
                        <span>{isCompleted ? 'Atendido' : 'Marcar atendido'}</span>
                      </button>
                      <button
                        type="button"
                        className="calendar-attendance calendar-noshow"
                        aria-label={isNoShow ? `Desmarcar "no vino": ${clientName}` : `Marcar que no vino: ${clientName}`}
                        aria-pressed={isNoShow}
                        disabled={pendingAttendance.has(reservation.id) || (!isNoShow && !canMarkAttended)}
                        onClick={() => void toggleAttendance(reservation, 'no_show')}
                      >
                        <X size={14} />
                        <span>{isNoShow ? 'No vino' : 'Marcar no vino'}</span>
                      </button>
                      {!isCompleted && !isNoShow && <button type="button" className="calendar-cancel" aria-label={`Cancelar turno de ${clientName}`} title="Cancelar turno" onClick={() => onCancel(reservation)}><X size={14} /></button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="calendar-message">
                {reservations.length === 0
                  ? 'No hay turnos para mostrar.'
                  : 'No hay turnos para este día. Elegí otro día del calendario.'}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function ServicesSection({ businessId }: { businessId: string }) {
  const [services, setServices] = useState<Service[]>([])
  const [error, setError] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()

  async function reload() { setServices(await listServices(businessId)) }
  useEffect(() => { void reload() }, [businessId])

  function updateLocal(id: string, patch: Partial<Service>) {
    setServices(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function persist(svc: Service) {
    void updateService(svc.id, { name: svc.name, duration_min: svc.duration_min, price: svc.price })
      .then(err => { if (err) setError(err) })
  }

  return <section className="agenda-card">
    <div className="services-heading">
      <div className="services-heading-mark"><Sparkles size={18} /></div>
      <div><p className="eyebrow">Servicios</p><h2>Lo que ofrecés</h2></div>
      <span className="services-count">{services.length} {services.length === 1 ? 'servicio' : 'servicios'}</span>
    </div>
    <div className="services-editor">
      <div className="services-list">
        <AnimatePresence initial={false}>
          {services.map(svc => (
            <motion.div
              key={svc.id}
              className="service-row"
              layout="position"
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
              transition={shouldReduceMotion ? { duration: 0.1 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="service-row-mark" aria-hidden="true"><Sparkles size={16} /></span>
              <label className="service-name">
                <span>Nombre del servicio</span>
                <input
                  aria-label={`Nombre del servicio ${svc.name || ''}`.trim()}
                  value={svc.name}
                  onChange={e => updateLocal(svc.id, { name: e.target.value })}
                  onBlur={() => persist(svc)}
                />
              </label>
              <label className="service-value service-duration">
                <span><Clock3 size={13} /> Duración</span>
                <span className="service-value-input">
                  <input
                    aria-label={`Duración de ${svc.name || 'servicio'} en minutos`}
                    type="number"
                    min={5}
                    step={5}
                    value={svc.duration_min}
                    onChange={e => updateLocal(svc.id, { duration_min: parseInt(e.target.value) || 0 })}
                    onBlur={() => persist(svc)}
                  />
                  <small>min</small>
                </span>
              </label>
              <label className="service-value service-price">
                <span><DollarSign size={13} /> Precio</span>
                <span className="service-value-input">
                  <small>$</small>
                  <input
                    aria-label={`Precio de ${svc.name || 'servicio'} en pesos`}
                    type="number"
                    min={0}
                    step={100}
                    value={svc.price}
                    onChange={e => updateLocal(svc.id, { price: parseInt(e.target.value) || 0 })}
                    onBlur={() => persist(svc)}
                  />
                </span>
              </label>
              <button
                type="button"
                className="service-remove"
                aria-label={`Eliminar ${svc.name || 'servicio'}`}
                onClick={() => void deleteService(svc.id).then(err => { if (err) setError(err); else void reload() })}
              >
                <Trash2 size={15} /><span>Eliminar</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {services.length === 0 && (
          <div className="services-empty">
            <span><Sparkles size={17} /></span>
            <div><strong>Todavía no hay servicios</strong><small>Sumá lo que ofrecés y definí cuánto dura y cuánto cuesta.</small></div>
          </div>
        )}
      </div>
      <div className="add-service">
        <button type="button" onClick={() => void createService(businessId, { name: 'Nuevo servicio', duration_min: 30, price: 0 }).then(err => { if (err) setError(err); else void reload() })}>
          <Plus size={15} /> Agregar servicio
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  </section>
}

function ConfigSection({ businessId, onSaved }: { businessId: string; onSaved: () => Promise<void> }) {
  const { business } = useAuth()
  const [name, setName] = useState(business?.name ?? '')
  const [slug, setSlug] = useState(business?.slug ?? '')
  const [cancelHours, setCancelHours] = useState(business?.cancel_min_hours ?? 2)
  const [minNotice, setMinNotice] = useState(business?.min_notice_hours ?? 1)
  const [maxAdvance, setMaxAdvance] = useState(business?.max_advance_days ?? 60)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancelOptions = [...new Set([0, 1, 2, 4, 12, 24, 48, 72, cancelHours])].sort((a, b) => a - b)
  const noticeOptions = [...new Set([0, 1, 2, 4, 12, 24, 48, minNotice])].sort((a, b) => a - b)
  const advanceOptions = [...new Set([7, 14, 30, 60, 90, 180, maxAdvance])].sort((a, b) => a - b)

  async function save() {
    setBusy(true)
    setMessage(null)
    const error = await updateBusiness(businessId, { name: name.trim(), slug: slugify(slug), cancel_min_hours: cancelHours, min_notice_hours: minNotice, max_advance_days: maxAdvance })
    setBusy(false)
    if (error) { setMessage(error.includes('duplicate') ? 'Ese enlace ya está en uso.' : error); return }
    await onSaved()
    setMessage('Cambios guardados ✓')
  }

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Configuración</p><h2>Tu negocio</h2></div></div>
    <label className="onboarding-field">Nombre del negocio
      <input value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>{window.location.host}/</span><input value={slug} onChange={e => setSlug(e.target.value)} /></div>
    </label>
    <label className="onboarding-field">Tus clientes pueden reservar con una anticipación mínima de
      <select value={minNotice} onChange={e => setMinNotice(Number(e.target.value))}>
        {noticeOptions.map(h => <option key={h} value={h}>{h === 0 ? 'Sin mínimo (hasta último momento)' : `${h} ${h === 1 ? 'hora' : 'horas'}`}</option>)}
      </select>
    </label>
    <label className="onboarding-field">y hasta
      <select value={maxAdvance} onChange={e => setMaxAdvance(Number(e.target.value))}>
        {advanceOptions.map(d => <option key={d} value={d}>{d} días hacia adelante</option>)}
      </select>
    </label>
    <label className="onboarding-field">Tus clientes pueden cancelar online
      <select value={cancelHours} onChange={e => setCancelHours(Number(e.target.value))}>
        {cancelOptions.map(h => <option key={h} value={h}>{h === 0 ? 'Hasta el momento del turno' : `Hasta ${h} ${h === 1 ? 'hora' : 'horas'} antes`}</option>)}
      </select>
    </label>
    <p className="form-note">Pasado ese límite, el cliente tiene que comunicarse con vos. Vos siempre podés cancelar desde tu panel. Los horarios se editan en la sección Equipo.</p>
    {message && <p className="form-note">{message}</p>}
    <button className="button button--primary" style={{ marginTop: 16 }} disabled={busy} onClick={() => void save()}>
      {busy ? 'Guardando…' : 'Guardar cambios'}
    </button>
  </section>
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(bookingUrl(slug))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copiá el enlace de reservas:', bookingUrl(slug))
    }
  }
  return <button type="button" className="icon-button" style={{ marginLeft: 'auto', width: 30, height: 30 }} aria-label={copied ? 'Enlace copiado' : 'Copiar enlace de reservas'} title={copied ? 'Copiado' : 'Copiar enlace de reservas'} onClick={() => void copy()}>
    {copied ? <Check size={15} /> : <Copy size={15} />}
  </button>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
