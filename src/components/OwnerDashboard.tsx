import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Bell, CalendarDays, CheckCircle2, Clock3, Ellipsis, LayoutDashboard, LogOut, Plus, Settings2, Sparkles, UsersRound } from 'lucide-react'
import { Brand } from './Brand'
import { formatPrice } from '../data/demo'
import { useAuth } from '../lib/auth'
import {
  createBusiness, createBusinessWithSetup, createService, deleteService, getAvailability, getDashboardStats,
  listReservations, listServices, setAvailability, updateBusiness, updateService,
  type DashboardStats, type Reservation, type Service,
} from '../lib/db'

type OwnerDashboardProps = { onExit: () => void }

const sections = ['Resumen', 'Agenda', 'Reservas', 'Servicios', 'Configuración']
const sectionIcons = [LayoutDashboard, CalendarDays, UsersRound, Sparkles, Settings2]

const days = [
  { id: 1, name: 'Lunes' }, { id: 2, name: 'Martes' }, { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' }, { id: 5, name: 'Viernes' }, { id: 6, name: 'Sábado' }, { id: 0, name: 'Domingo' },
]
const hours = Array.from({ length: 24 }, (_, i) => i)

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

function readPendingSetup(): PendingSetup | null {
  try {
    const raw = localStorage.getItem('reser-pending-setup')
    return raw ? JSON.parse(raw) as PendingSetup : null
  } catch { return null }
}

function CreateBusinessCard() {
  const { session, refreshBusiness } = useAuth()
  const [pending] = useState<PendingSetup | null>(() => readPendingSetup())
  const [name, setName] = useState(pending?.name ?? '')
  const [slug, setSlug] = useState(pending?.slug ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setError(null)
    if (!name.trim() || !slug.trim()) { setError('Completá el nombre y el enlace de tu negocio.'); return }
    if (!session) { setError('Tu sesión expiró. Volvé a iniciar sesión.'); return }
    setBusy(true)
    const input = { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-') }
    // Si venimos del onboarding con servicios/horarios cargados, los creamos todos juntos.
    const err = pending
      ? await createBusinessWithSetup(session.user.id, { ...input, services: pending.services, availability: pending.availability })
      : await createBusiness(session.user.id, input)
    setBusy(false)
    if (err) { setError(err.includes('duplicate') ? 'Ese enlace ya está en uso. Elegí otro.' : err); return }
    try { localStorage.removeItem('reser-pending-setup') } catch { /* noop */ }
    await refreshBusiness()
  }

  return <section className="agenda-card" style={{ maxWidth: 520 }}>
    <div className="card-heading"><div><p className="eyebrow">Primer paso</p><h2>Creá tu negocio</h2></div></div>
    <p style={{ color: '#7a919c', fontSize: 14, margin: '0 0 16px' }}>
      {pending
        ? 'Recuperamos los servicios y horarios que cargaste al registrarte. Confirmá el nombre y el enlace para dejar todo listo.'
        : 'Solo necesitás el nombre y tu enlace. Los servicios y horarios los cargás después desde las secciones del panel.'}
    </p>
    <label className="onboarding-field">Nombre del negocio
      <input placeholder="Ej: Peluquería López" value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>reser.com.ar/</span><input placeholder="tu-negocio" value={slug} onChange={e => setSlug(e.target.value)} /></div>
    </label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button--primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void create()}>
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
  const [slots, setSlots] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getAvailability(businessId).then(setSlots) }, [businessId])

  function toggle(day: number, hour: number) {
    const key = `${day}-${hour}`
    setSlots(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    const bizError = await updateBusiness(businessId, { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-') })
    const avError = bizError ?? await setAvailability(businessId, slots)
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
    <div className="availability-table">
      <table>
        <thead><tr><th></th>{hours.map(h => <th key={h}>{h.toString().padStart(2, '0')}:00</th>)}</tr></thead>
        <tbody>
          {days.map(day => (
            <tr key={day.id}>
              <th>{day.name}</th>
              {hours.map(hour => (
                <td key={hour}>
                  <input type="checkbox" checked={slots.has(`${day.id}-${hour}`)} onChange={() => toggle(day.id, hour)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {message && <p className="form-note">{message}</p>}
    <button className="button button--primary" style={{ marginTop: 16 }} disabled={busy} onClick={() => void save()}>
      {busy ? 'Guardando…' : 'Guardar cambios'}
    </button>
  </section>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
