import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Bell, CalendarDays, CheckCircle2, Clock3, Ellipsis, LayoutDashboard, LogOut, Plus, Settings2, Sparkles, UsersRound } from 'lucide-react'
import { Brand } from './Brand'
import { formatPrice } from '../data/demo'
import { useAuth } from '../lib/auth'
import {
  AvailabilityEditor,
  availabilityFromSlots,
  availabilitySlotsFromMap,
  type AvailabilityDay,
  type AvailabilityMap,
} from './AvailabilityEditor'
import {
  createBusiness, createBusinessWithSetup, createService, deleteService, getAvailability, getDashboardStats,
  listReservations, listServices, setAvailability, updateBusiness, updateService,
  type DashboardStats, type Reservation, type Service,
} from '../lib/db'

type OwnerDashboardProps = { onExit: () => void }

const sections = ['Resumen', 'Agenda', 'Reservas', 'Servicios', 'Configuración']
const sectionIcons = [LayoutDashboard, CalendarDays, UsersRound, Sparkles, Settings2]

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

  useEffect(() => {
    if (!business) return
    getDashboardStats(business.id).then(setStats)
    listReservations(business.id).then(setReservations)
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
        <span><strong>{business.name}</strong><small>reser.com.ar/{business.slug}</small></span>
        <Ellipsis size={18} />
      </div>
      <nav>{sections.map((item, index) => { const Icon = sectionIcons[index]; return <button className={active === item ? 'is-active' : ''} key={item} onClick={() => setActive(item)}><Icon size={18} />{item}</button> })}</nav>
      <button className="sidebar-exit" onClick={() => { void signOut(); onExit() }}><LogOut size={17} /> Cerrar sesión</button>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-header">
        <div><p className="eyebrow">{todayLabel()}</p><h1>{greeting()}, {profile?.full_name ?? 'bienvenido'} <span>✦</span></h1></div>
        <div className="header-actions"><button className="icon-button" aria-label="Notificaciones"><Bell size={19} /><i /></button><button className="button button--primary" onClick={() => setActive('Reservas')}><Plus size={17} /> Nueva reserva</button></div>
      </header>

      {active === 'Resumen' && <>
        <section className="dashboard-stats">
          <Metric icon={<CalendarDays size={19} />} label="Turnos para hoy" value={String(stats?.todayCount ?? 0)} detail="Reservas confirmadas" />
          <Metric icon={<UsersRound size={19} />} label="Clientes este mes" value={String(stats?.monthClients ?? 0)} detail="Clientes únicos con turno" />
          <Metric icon={<CheckCircle2 size={19} />} label="Tasa de asistencia" value={stats?.attendanceRate == null ? '—' : `${stats.attendanceRate}%`} detail="Turnos no cancelados" />
        </section>
        <section className="dashboard-grid"><div className="agenda-card">
          <div className="card-heading"><div><p className="eyebrow">Tu agenda</p><h2>Próximas reservas</h2></div><button className="link-button" onClick={() => setActive('Reservas')}>Ver todas</button></div>
          <ReservationList reservations={reservations} />
        </div></section>
      </>}

      {(active === 'Agenda' || active === 'Reservas') && (
        <section className="agenda-card">
          <div className="card-heading"><div><p className="eyebrow">{active}</p><h2>Próximas reservas</h2></div></div>
          <ReservationList reservations={reservations} />
        </section>
      )}

      {active === 'Servicios' && <ServicesSection businessId={business.id} />}
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
    return Array.isArray(hours) && hours.length === 24 && hours.every(hour => typeof hour === 'boolean')
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
    const input = { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-') }
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

function ReservationList({ reservations }: { reservations: Reservation[] }) {
  if (reservations.length === 0) {
    return <p style={{ color: '#7a919c', fontSize: 13, padding: '12px 0' }}>Todavía no hay reservas. Cuando tus clientes reserven desde tu enlace, van a aparecer acá.</p>
  }
  const colors = ['blue', 'violet', 'orange']
  return <div className="agenda-list">{reservations.map((r, index) => {
    const date = new Date(r.starts_at)
    const clientName = r.clients?.name ?? 'Cliente'
    return <motion.div className="reservation-row" key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
      <time>{date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time>
      <span className={`avatar avatar--${colors[index % colors.length]}`}>{initials(clientName)}</span>
      <span className="reservation-info"><strong>{clientName}</strong><small>{r.services?.name ?? 'Servicio'}</small></span>
      <b>{r.services ? formatPrice(Number(r.services.price)) : ''}</b>
      <button aria-label={`Acciones para ${clientName}`}><Ellipsis size={19} /></button>
    </motion.div>
  })}</div>
}

function ServicesSection({ businessId }: { businessId: string }) {
  const [services, setServices] = useState<Service[]>([])
  const [error, setError] = useState<string | null>(null)

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
    <div className="card-heading"><div><p className="eyebrow">Servicios</p><h2>Lo que ofrecés</h2></div></div>
    <div className="setup-services">
      {services.map(svc => (
        <div key={svc.id} className="service-row">
          <input value={svc.name} onChange={e => updateLocal(svc.id, { name: e.target.value })} onBlur={() => persist(svc)} />
          <input type="number" min={5} step={5} value={svc.duration_min}
            onChange={e => updateLocal(svc.id, { duration_min: parseInt(e.target.value) || 0 })} onBlur={() => persist(svc)} />
          <input type="number" min={0} step={100} value={svc.price}
            onChange={e => updateLocal(svc.id, { price: parseInt(e.target.value) || 0 })} onBlur={() => persist(svc)} />
          <button className="service-remove" onClick={() => void deleteService(svc.id).then(err => { if (err) setError(err); else void reload() })}>Eliminar</button>
        </div>
      ))}
      <div className="add-service">
        <button onClick={() => void createService(businessId, { name: 'Nuevo servicio', duration_min: 30, price: 0 }).then(err => { if (err) setError(err); else void reload() })}>+ Agregar servicio</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  </section>
}

function ConfigSection({ businessId, onSaved }: { businessId: string; onSaved: () => Promise<void> }) {
  const { business } = useAuth()
  const [name, setName] = useState(business?.name ?? '')
  const [slug, setSlug] = useState(business?.slug ?? '')
  const [availability, setAvailabilityMap] = useState<AvailabilityMap>(() => availabilityFromSlots(days, new Set()))
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [availabilityLoadFailed, setAvailabilityLoadFailed] = useState(false)

  useEffect(() => {
    let active = true
    setLoadingAvailability(true)
    setAvailabilityLoadFailed(false)
    getAvailability(businessId)
      .then(slots => {
        if (active) setAvailabilityMap(availabilityFromSlots(days, slots))
      })
      .catch(loadError => {
        if (!active) return
        setAvailabilityLoadFailed(true)
        setMessage(`No pudimos cargar los horarios: ${loadError instanceof Error ? loadError.message : 'error inesperado'}. Recargá la página para volver a intentar.`)
      })
      .finally(() => {
        if (active) setLoadingAvailability(false)
      })
    return () => { active = false }
  }, [businessId])

  async function save() {
    if (loadingAvailability || availabilityLoadFailed) return
    setBusy(true)
    setMessage(null)
    const bizError = await updateBusiness(businessId, { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-') })
    const avError = bizError ?? await setAvailability(businessId, availabilitySlotsFromMap(availability))
    setBusy(false)
    if (avError) { setMessage(avError.includes('duplicate') ? 'Ese enlace ya está en uso.' : avError); return }
    await onSaved()
    setMessage('Cambios guardados ✓')
  }

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Configuración</p><h2>Tu negocio</h2></div></div>
    <label className="onboarding-field">Nombre del negocio
      <input value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>reser.com.ar/</span><input value={slug} onChange={e => setSlug(e.target.value)} /></div>
    </label>
    <p className="eyebrow" style={{ marginTop: 20 }}>Disponibilidad</p>
    {loadingAvailability && <p className="form-note" role="status">Cargando tus horarios…</p>}
    <AvailabilityEditor days={days} availability={availability} onChange={setAvailabilityMap} />
    {message && <p className="form-note">{message}</p>}
    <button className="button button--primary" style={{ marginTop: 16 }} disabled={busy || loadingAvailability || availabilityLoadFailed} onClick={() => void save()}>
      {busy ? 'Guardando…' : loadingAvailability ? 'Cargando horarios…' : 'Guardar cambios'}
    </button>
  </section>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
