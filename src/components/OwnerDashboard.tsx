import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react'
import { CalendarDays, CalendarOff, CalendarPlus, Check, CheckCircle2, Ellipsis, ChevronLeft, ChevronRight, Clock3, Copy, LayoutDashboard, LogOut, Mail, Pencil, Phone, Plus, Settings2, Sparkles, Trash2, TriangleAlert, UserRound, UsersRound, Volume2, VolumeX, X } from 'lucide-react'
import { Brand } from './Brand'
import { formatPrice, priceLabel } from '../data/demo'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errorMessages'
import { copyText } from '../lib/clipboard'
import * as field from '../lib/fieldRules'
import { bookingUrl, goTo, panelSectionFromPath, slugify } from '../lib/routes'
import { EyeOff } from 'lucide-react'
import { TeamSection } from './TeamSection'
import { TimeOffSection } from './TimeOffSection'
import { ReservationsSection } from './ReservationsSection'
import { MyScheduleSection } from './MyScheduleSection'
import { PendingInviteCard, readPendingInvite } from './JoinTeam'
import { useConfirm } from './ConfirmDialog'
import { describeReservation, useReservationAlerts } from '../lib/reservationAlerts'
import { SegmentIndicator } from './SegmentIndicator'
import { ShareLinkCard, TodayCard } from './SummaryCards'
import { ErrorBoundary } from './ErrorBoundary'
import type { AvailabilityDay } from './AvailabilityEditor'
import {
  cancelOwnerReservation, setServiceActive, createBusiness, createBusinessWithSetup, logoUrl, removeBusinessLogo, uploadBusinessLogo, createOwnerReservation, createService, deleteService, getDashboardStats, getPublicSlots,
  listAgendaReservations, listReservationServices, listReservations, listServices, updateBusiness, updateReservationStatus, updateService,
  listProfessionals, listResourceServices, type DashboardStats, type Professional, type Reservation, type ResourceService, type Service,
} from '../lib/db'

type OwnerDashboardProps = { onExit: () => void }

type SectionKey = 'Resumen' | 'Agenda' | 'Reservas' | 'Servicios' | 'Equipo' | 'Días libres' | 'Configuración' | 'Mis horarios'
type SectionItem = { key: SectionKey; label: string; icon: typeof LayoutDashboard }

const OWNER_SECTIONS: SectionItem[] = [
  { key: 'Resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'Agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'Reservas', label: 'Reservas', icon: UsersRound },
  { key: 'Servicios', label: 'Servicios', icon: Sparkles },
  { key: 'Equipo', label: 'Equipo', icon: UserRound },
  { key: 'Días libres', label: 'Días libres', icon: CalendarOff },
  { key: 'Configuración', label: 'Configuración', icon: Settings2 },
]
// Un profesional con cuenta solo ve lo suyo: sin estadísticas, servicios, equipo, días libres ni configuración.
const STAFF_SECTIONS: SectionItem[] = [
  { key: 'Agenda', label: 'Mi agenda', icon: CalendarDays },
  { key: 'Reservas', label: 'Mis reservas', icon: UsersRound },
  { key: 'Mis horarios', label: 'Mis horarios', icon: Clock3 },
]

// Cada sección tiene su dirección: /panel, /panel/agenda, /panel/dias-libres…
const SECTION_PATHS: Record<SectionKey, string> = {
  Resumen: '', Agenda: 'agenda', Reservas: 'reservas', Servicios: 'servicios', Equipo: 'equipo',
  'Días libres': 'dias-libres', Configuración: 'configuracion', 'Mis horarios': 'mis-horarios',
}
function sectionFromPath(): SectionKey | null {
  const path = panelSectionFromPath(window.location.pathname)
  if (path === null) return null
  return (Object.keys(SECTION_PATHS) as SectionKey[]).find(key => SECTION_PATHS[key] === path) ?? null
}

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
  const { profile, business, role, staffResource, signOut, refreshBusiness } = useAuth()
  const isStaff = role === 'staff'
  const sections = isStaff ? STAFF_SECTIONS : OWNER_SECTIONS
  const [selectedSection, setActive] = useState<SectionKey>(() => sectionFromPath() ?? (isStaff ? 'Agenda' : 'Resumen'))
  // Si cambia el rol (por ejemplo, al aceptar una invitación) se muestra una sección que exista para ese rol
  const active = sections.some(section => section.key === selectedSection) ? selectedSection : sections[0].key
  const navGroup = useId()
  const tabGroup = useId()
  const [moreOpen, setMoreOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  // Cada sección arranca desde arriba (antes se conservaba el scroll de la anterior) y queda en la dirección
  useEffect(() => {
    window.scrollTo({ top: 0 })
    goTo(SECTION_PATHS[active] ? `/panel/${SECTION_PATHS[active]}` : '/panel')
  }, [active])
  // Atrás / Adelante del navegador entre secciones del panel
  useEffect(() => {
    const onPop = () => { const section = sectionFromPath(); if (section) setActive(section) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [pendingInvite, setPendingInvite] = useState(readPendingInvite)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([])
  const [agendaLoading, setAgendaLoading] = useState(true)
  const [agendaError, setAgendaError] = useState<string | null>(null)
  const [showNewReservation, setShowNewReservation] = useState(false)
  const [reservationNotice, setReservationNotice] = useState<string | null>(null)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [cancelNotice, setCancelNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const activeProfessionals = professionals.filter(p => p.is_active)
  const reloadProfessionals = async () => {
    if (business) setProfessionals(await listProfessionals(business.id))
  }

  // true si se canceló (la sección Reservas lo usa para actualizar su lista)
  async function cancelReservation(reservation: Reservation): Promise<boolean> {
    if (!business) return false
    const who = reservation.clients?.name ?? 'el cliente'
    const accepted = await confirm({
      title: `¿Cancelar el turno de ${who}?`,
      message: 'El horario va a quedar libre y se le avisa por mail.',
      confirmLabel: 'Sí, cancelar turno',
      cancelLabel: 'No, mantenerlo',
      danger: true,
    })
    if (!accepted) return false
    setCancelNotice(null)
    const cancelError = await cancelOwnerReservation(reservation.id)
    if (cancelError) { setCancelNotice({ text: `No pudimos cancelar el turno: ${cancelError}`, isError: true }); return false }
    setUpcomingReservations(current => current.filter(item => item.id !== reservation.id))
    if (!isStaff) {
      void listReservations(business.id).then(setReservations)
      void getDashboardStats(business.id).then(setStats)
    }
    setCancelNotice({ text: `Cancelaste el turno de ${who}.`, isError: false })
    return true
  }

  // Se marcó atendida / no vino desde la sección Reservas: la Agenda y las estadísticas se ponen al día
  function reservationStatusChanged(id: string, status: 'confirmed' | 'completed' | 'no_show') {
    setUpcomingReservations(current => current.map(item => item.id === id ? { ...item, status } : item))
    if (business && !isStaff) void getDashboardStats(business.id).then(setStats)
  }

  useEffect(() => {
    if (!business) return
    void reloadProfessionals()
    // Las estadísticas y el Resumen son solo del dueño
    if (!isStaff) {
      getDashboardStats(business.id).then(setStats)
      listReservations(business.id).then(setReservations)
    }
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
        setAgendaError(loadError instanceof Error ? friendlyError(loadError.message) : 'No pudimos cargar los próximos turnos.')
      })
      .finally(() => {
        if (active) setAgendaLoading(false)
      })
    return () => { active = false }
  }, [business, isStaff])

  // Llegó una reserva por tiempo real (o se reconectó): Agenda, Resumen y Reservas se actualizan sin recargar
  function refreshReservations() {
    if (!business) return
    void listAgendaReservations(business.id).then(result => { if (!result.error) setUpcomingReservations(result.reservations) })
    if (!isStaff) {
      void listReservations(business.id).then(setReservations)
      void getDashboardStats(business.id).then(setStats)
    }
    setHistoryVersion(version => version + 1)
  }
  const alerts = useReservationAlerts(business?.id ?? null, {
    onChange: refreshReservations,
    onOpen: () => setActive('Agenda'),
  })

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
        {pendingInvite
          ? <PendingInviteCard token={pendingInvite} onDiscard={() => setPendingInvite(null)} />
          : <CreateBusinessCard />}
      </main>
    </div>
  }

  return <div className="dashboard">
    <aside className="dashboard-sidebar"><Brand />
      <div className="business-switch">
        <span className="mini-logo" style={logoUrl(business.logo_path) ? { backgroundImage: `url(${logoUrl(business.logo_path)})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{initials(business.name)}</span>
        <span><strong>{business.name}</strong><small>{window.location.host}/{business.slug}</small></span>
        <CopyLinkButton slug={business.slug} />
      </div>
      <nav>{sections.map(({ key, label, icon: Icon }) => <button className={active === key ? 'is-active' : ''} aria-current={active === key ? 'page' : undefined} key={key} onClick={() => setActive(key)}>{active === key && <SegmentIndicator group={navGroup} />}<Icon size={18} />{label}</button>)}</nav>
      <button className="sidebar-exit" onClick={() => { void signOut(); onExit() }}><LogOut size={17} /> Cerrar sesión</button>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-header">
        {/* El título nombra la sección en la que estás; el saludo queda solo en el Resumen */}
        <div><p className="eyebrow">{todayLabel()}</p><h1>{active === 'Resumen'
          ? <>{greeting()}, {profile?.full_name ?? 'bienvenido'} <span>✦</span></>
          : sections.find(section => section.key === active)?.label ?? active}</h1></div>
        <AlertsToggle alerts={alerts} />
      </header>

      {alerts.latest && <NewReservationBanner
        key={alerts.latest.id}
        reservation={alerts.latest}
        onView={() => { setActive('Agenda'); alerts.dismissLatest() }}
        onClose={alerts.dismissLatest}
      />}
      {cancelNotice && <p className={cancelNotice.isError ? 'calendar-message calendar-message--error' : 'reservation-form-success'} role={cancelNotice.isError ? 'alert' : 'status'}>{cancelNotice.text}</p>}
      {confirmDialog}

      {/* Si una sección falla, solo ella muestra el error: el menú y el resto del panel siguen funcionando */}
      <ErrorBoundary variant="section" resetKey={active}>
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeIn' } }}
      >
      {active === 'Resumen' && <>
        {/* Arriba lo que se hace hoy: marcar los turnos que ya pasaron y compartir el enlace para que lleguen reservas */}
        <section className="dashboard-grid dashboard-top">
          <TodayCard reservations={upcomingReservations} loading={agendaLoading} showProfessional={activeProfessionals.length > 1} onStatusChanged={reservationStatusChanged} onSeeAll={() => setActive('Reservas')} />
          <ShareLinkCard name={business.name} slug={business.slug} />
        </section>
        <section className="dashboard-stats">
          <Metric icon={<CalendarDays size={19} />} label="Turnos para hoy" value={String(stats?.todayCount ?? 0)} detail="Reservas confirmadas" />
          <Metric icon={<UsersRound size={19} />} label="Clientes este mes" value={String(stats?.monthClients ?? 0)} detail="Clientes únicos con turno" />
          <Metric icon={<CheckCircle2 size={19} />} label="Tasa de asistencia" value={stats?.attendanceRate == null ? '—' : `${stats.attendanceRate}%`} detail="Sobre los turnos que marcaste" />
        </section>
        {/* Los de hoy ya están en "Hoy": acá van los de los próximos días */}
        <section className="agenda-card">
          <div className="card-heading"><h2>Próximos días</h2><button className="link-button" onClick={() => setActive('Reservas')}>Ver todas</button></div>
          <ReservationList reservations={reservations.filter(r => new Date(r.starts_at).toDateString() !== new Date().toDateString())} showProfessional={activeProfessionals.length > 1} onCancel={cancelReservation} />
        </section>
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
          <div className="card-heading"><div><p className="eyebrow">Reservas</p><h2>Todas tus reservas</h2></div>{!showNewReservation && <button type="button" className="button button--primary button--small" onClick={() => { setReservationNotice(null); setShowNewReservation(true) }}><Plus size={15} /> Nueva reserva</button>}</div>
          {showNewReservation && <ManualReservationForm
            businessId={business.id}
            businessSlug={business.slug}
            professionals={activeProfessionals}
            fixedResourceId={isStaff ? staffResource?.id : undefined}
            onCancel={() => setShowNewReservation(false)}
            onCreated={reservation => {
              setReservations(current => [...current, reservation].sort((a, b) =>
                new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
              ).slice(0, 10))
              setUpcomingReservations(current => [...current, reservation].sort((a, b) =>
                new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
              ))
              setReservationNotice('La reserva se agregó correctamente.')
              setHistoryVersion(version => version + 1)
              setShowNewReservation(false)
              if (!isStaff) void getDashboardStats(business.id).then(setStats)
            }}
          />}
          {reservationNotice && <p className="reservation-form-success" role="status">{reservationNotice}</p>}
          <ReservationsSection
            businessId={business.id}
            professionals={professionals}
            reloadKey={historyVersion}
            onCancel={cancelReservation}
            onStatusChanged={reservationStatusChanged}
          />
        </section>
      )}

      {active === 'Servicios' && <ServicesSection businessId={business.id} />}
      {active === 'Días libres' && <TimeOffSection businessId={business.id} professionals={professionals} />}
      {active === 'Equipo' && <TeamSection businessId={business.id} days={days} professionals={professionals} onChanged={reloadProfessionals} />}
      {active === 'Configuración' && <ConfigSection businessId={business.id} onSaved={refreshBusiness} />}
      {active === 'Mis horarios' && staffResource && <MyScheduleSection businessId={business.id} resourceId={staffResource.id} days={days} />}
      </motion.div>
      </AnimatePresence>
      </ErrorBoundary>
    </main>

    {/* En el celular la barra lateral no entra: las secciones van en una barra fija abajo, el resto en "Más" */}
    <nav className="dashboard-tabbar" aria-label="Secciones del panel">
      {sections.slice(0, 3).map(({ key, label, icon: Icon }) => <button type="button" key={key} className={active === key ? 'is-active' : ''} aria-current={active === key ? 'page' : undefined} onClick={() => setActive(key)}>
        {active === key && <SegmentIndicator group={tabGroup} />}<Icon size={19} /><span>{label}</span>
      </button>)}
      <button type="button" className={sections.slice(3).some(section => section.key === active) ? 'is-active' : ''} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
        {sections.slice(3).some(section => section.key === active) && <SegmentIndicator group={tabGroup} />}<Ellipsis size={19} /><span>Más</span>
      </button>
    </nav>
    <AnimatePresence>
      {moreOpen && <MoreSheet
        business={business}
        sections={sections.slice(3)}
        active={active}
        onPick={key => { setActive(key); setMoreOpen(false) }}
        onClose={() => setMoreOpen(false)}
        onSignOut={() => { void signOut(); onExit() }}
      />}
    </AnimatePresence>
  </div>
}

// Hoja que sube desde abajo en el celular: el negocio con su enlace, las secciones que no entran en la barra y Cerrar sesión
function MoreSheet({ business, sections, active, onPick, onClose, onSignOut }: {
  business: { name: string; slug: string; logo_path: string | null }
  sections: SectionItem[]
  active: SectionKey
  onPick: (key: SectionKey) => void
  onClose: () => void
  onSignOut: () => void
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheetRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); opener?.focus() }
  }, [])
  const logo = logoUrl(business.logo_path)
  return <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} onClick={onClose}>
    <motion.div
      ref={sheetRef}
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Más opciones del panel"
      initial={{ y: '100%' }}
      animate={{ y: 0, transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] } }}
      exit={{ y: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
      onClick={event => event.stopPropagation()}
    >
      <span className="sheet-handle" aria-hidden="true" />
      <div className="business-switch">
        <span className="mini-logo" style={logo ? { backgroundImage: `url(${logo})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{initials(business.name)}</span>
        <span><strong>{business.name}</strong><small>{window.location.host}/{business.slug}</small></span>
        <CopyLinkButton slug={business.slug} />
      </div>
      <nav>{sections.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={active === key ? 'is-active' : ''} aria-current={active === key ? 'page' : undefined} onClick={() => onPick(key)}><Icon size={18} />{label}</button>)}</nav>
      <button type="button" className="sheet-exit" onClick={onSignOut}><LogOut size={17} /> Cerrar sesión</button>
    </motion.div>
  </motion.div>
}

// Activa el sonido y las notificaciones del sistema para las reservas nuevas (la preferencia queda en este navegador)
function AlertsToggle({ alerts }: { alerts: ReturnType<typeof useReservationAlerts> }) {
  const detail = !alerts.enabled ? 'De reservas nuevas'
    : alerts.permission === 'granted' ? 'Sonido y notificaciones'
    : alerts.permission === 'denied' ? 'Solo sonido · notificaciones bloqueadas'
    : 'Solo sonido'
  return <button
    type="button"
    className={`alerts-toggle${alerts.enabled ? ' is-on' : ''}`}
    aria-pressed={alerts.enabled}
    title={alerts.enabled && alerts.permission === 'denied' ? 'Para recibir notificaciones, permitilas desde el candado de la barra de direcciones.' : undefined}
    onClick={() => { if (alerts.enabled) alerts.disable(); else void alerts.enable() }}
  >
    <span className="alerts-toggle-icon" aria-hidden="true">{alerts.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</span>
    <span className="alerts-toggle-text"><strong>{alerts.enabled ? 'Avisos activados' : 'Activar avisos'}</strong><small>{detail}</small></span>
  </button>
}

function NewReservationBanner({ reservation, onView, onClose }: { reservation: Reservation; onView: () => void; onClose: () => void }) {
  const { who, when } = describeReservation(reservation)
  return <div className="new-reservation" role="status">
    <span className="new-reservation-icon" aria-hidden="true"><CalendarPlus size={17} /></span>
    <span className="new-reservation-text"><strong>Nueva reserva: {who}</strong><small>{when}</small></span>
    <button type="button" className="button button--secondary button--small" onClick={onView}>Ver en la agenda</button>
    <button type="button" className="new-reservation-close" aria-label="Cerrar aviso" onClick={onClose}><X size={15} /></button>
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
      const detail = createError instanceof Error ? friendlyError(createError.message) : 'error inesperado'
      setError(`No pudimos crear el negocio: ${detail}. Tus datos siguen guardados; volvé a intentar.`)
      return
    }
    setBusy(false)
    if (err) { setError(err); return }
    try {
      localStorage.removeItem('reser-pending-setup')
    } catch (storageError) {
      const detail = storageError instanceof Error ? friendlyError(storageError.message) : 'error inesperado'
      console.error('El negocio se creó, pero no se pudieron borrar los datos pendientes:', detail)
    }
    await refreshBusiness()
  }

  return <section className="agenda-card" style={{ maxWidth: 520 }}>
    <div className="card-heading"><div><p className="eyebrow">Primer paso</p><h2>Creá tu negocio</h2></div></div>
    <p style={{ color: 'var(--text-3)', fontSize: 14, margin: '0 0 16px' }}>
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
      <input placeholder="Ej: Peluquería López" value={name} onChange={e => setName(field.freeText(e.target.value))} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>reser.com.ar/</span><input placeholder="tu-negocio" value={slug} onChange={e => setSlug(field.slugText(e.target.value))} /></div>
    </label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button--primary" style={{ marginTop: 8 }} disabled={busy || Boolean(pendingState.error)} onClick={() => void create()}>
      {busy ? 'Creando…' : 'Crear mi negocio'}
    </button>
  </section>
}

function ReservationList({ reservations, showProfessional, onCancel }: { reservations: Reservation[]; showProfessional: boolean; onCancel: (reservation: Reservation) => void }) {
  if (reservations.length === 0) {
    return <p style={{ color: 'var(--text-3)', fontSize: 13, padding: '12px 0' }}>Todavía no hay reservas. Las que lleguen desde tu enlace o agregues manualmente van a aparecer acá.</p>
  }
  return <div className="agenda-list">{reservations.map((r, index) => {
    const date = new Date(r.starts_at)
    const clientName = r.clients?.name ?? 'Cliente'
    return <motion.div className="reservation-row" key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
      <time>{date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</time>
      <span className="avatar">{initials(clientName)}</span>
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
  fixedResourceId,
  onCancel,
  onCreated,
}: {
  businessId: string
  businessSlug: string
  professionals: Professional[]
  fixedResourceId?: string // profesional con cuenta: solo carga turnos en su propia agenda
  onCancel: () => void
  onCreated: (reservation: Reservation) => void
}) {
  const [services, setServices] = useState<Service[]>([])
  const [serviceId, setServiceId] = useState('')
  const [resourceId, setResourceId] = useState(fixedResourceId ?? '') // '' = cualquier profesional
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
    Promise.all([listReservationServices(businessId), listResourceServices(businessId)]).then(([result, pairs]) => {
      if (!active) return
      // En la agenda de un profesional, solo los servicios que ofrece él
      const usable = fixedResourceId
        ? result.services.filter(service => pairs.some(o => o.resource_id === fixedResourceId && o.service_id === service.id))
        : result.services
      setServices(usable)
      setOffers(pairs)
      setError(result.error)
      setServiceId(usable[0]?.id ?? '')
    }).catch(loadError => {
      if (!active) return
      setError(loadError instanceof Error ? friendlyError(loadError.message) : 'No pudimos cargar los servicios.')
    }).finally(() => {
      if (active) setLoadingServices(false)
    })
    return () => { active = false }
  }, [businessId, fixedResourceId])

  // Solo los profesionales que ofrecen el servicio elegido
  const serviceProfessionals = professionals.filter(p =>
    offers.some(o => o.resource_id === p.id && o.service_id === serviceId))
  useEffect(() => {
    if (fixedResourceId) return
    if (resourceId && !serviceProfessionals.some(p => p.id === resourceId)) setResourceId('')
  }, [serviceProfessionals.map(p => p.id).join(','), resourceId, fixedResourceId])

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
        setError(loadError instanceof Error ? friendlyError(loadError.message) : 'No pudimos cargar los horarios disponibles.')
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
      setError(submitError instanceof Error ? friendlyError(submitError.message) : 'No pudimos guardar la reserva.')
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
          <p>{error ?? (fixedResourceId
            ? 'Todavía no tenés servicios asignados para reservar. El dueño del negocio los asigna en la sección Equipo.'
            : 'Todavía no hay servicios activos para reservar.')}</p>
          <button type="button" className="link-button" onClick={onCancel}>Cerrar</button>
        </div>
      ) : (
        <>
          <div className="manual-reservation-fields">
            <label>
              <span>Nombre del cliente</span>
              <div><UserRound size={16} /><input required autoComplete="off" autoCapitalize="words" value={name} onChange={event => setName(field.personName(event.target.value))} /></div>
            </label>
            <label>
              <span>Correo electrónico</span>
              <div><Mail size={16} /><input required type="email" autoComplete="off" value={email} onChange={event => setEmail(field.email(event.target.value))} /></div>
            </label>
            <label>
              <span>Teléfono <small>(opcional)</small></span>
              <div><Phone size={16} /><input type="tel" inputMode="tel" maxLength={40} autoComplete="off" value={phone} onChange={event => setPhone(field.phone(event.target.value))} /></div>
            </label>
            <label>
              <span>Servicio</span>
              <select required value={serviceId} onChange={event => setServiceId(event.target.value)}>
                {services.map(service => <option key={service.id} value={service.id}>{service.name} · {service.duration_min} min · {formatPrice(Number(service.price))}</option>)}
              </select>
            </label>
            {!fixedResourceId && serviceProfessionals.length > 1 && <label>
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
                {slots.map(slot => <option key={slot} value={slot}>{new Date(slot).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</option>)}
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
  const modeGroup = useId()
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
      setAttendanceError(`No pudimos actualizar el turno de ${clientName}: ${updateError instanceof Error ? friendlyError(updateError.message) : 'Ocurrió un error inesperado.'}`)
    } finally {
      setPendingAttendance(current => {
        const next = new Set(current)
        next.delete(reservation.id)
        return next
      })
    }
  }

  return (<>
    <section className="agenda-card calendar-card">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>{mode === 'week' ? 'Tu semana, de un vistazo' : 'Tu mes, de un vistazo'}</h2>
        </div>
        <div className="calendar-mode" role="group" aria-label="Vista del calendario">
          <button type="button" aria-pressed={mode === 'week'} className={mode === 'week' ? 'is-active' : ''} onClick={() => setMode('week')}>{mode === 'week' && <SegmentIndicator group={modeGroup} />}Semana</button>
          <button type="button" aria-pressed={mode === 'month'} className={mode === 'month' ? 'is-active' : ''} onClick={() => setMode('month')}>{mode === 'month' && <SegmentIndicator group={modeGroup} />}Mes</button>
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
          <div className={`calendar-grid calendar-grid--${mode}`}>
            <div className="calendar-weekdays">
              {weekdays.map(day => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-days">
              {dates.map(date => {
                const key = dateKey(date)
                const dayReservations = reservationsByDate.get(key) ?? []
                const completedCount = dayReservations.filter(reservation => reservation.status === 'completed').length
                const noShowCount = dayReservations.filter(reservation => reservation.status === 'no_show').length
                const isCurrentMonth = date.getMonth() === selectedDate.getMonth()
                const isSelected = key === dateKey(selectedDate)
                const isToday = key === dateKey(today)

                return (
                  <button
                    type="button"
                    key={key}
                    className={`calendar-day${isCurrentMonth ? '' : ' is-outside'}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${dayReservations.length ? ' has-reservations' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`${date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${dayReservations.length} ${dayReservations.length === 1 ? 'turno' : 'turnos'}${completedCount ? `, ${completedCount} atendidos` : ''}${noShowCount ? `, ${noShowCount} no vinieron` : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    {mode === 'week' && <span className="calendar-day-weekday">{date.toLocaleDateString('es-AR', { weekday: 'short' })}</span>}
                    <span className="calendar-day-number">{date.getDate()}</span>
                    {mode === 'week' ? (
                      <span className="calendar-day-events">
                        {dayReservations.slice(0, 3).map(reservation => (
                          <span className={`calendar-week-event${reservation.status === 'completed' ? ' is-completed' : ''}${reservation.status === 'no_show' ? ' is-noshow' : ''}`} key={reservation.id}>
                            <time>{new Date(reservation.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</time>
                            <span>{reservation.clients?.name ?? 'Cliente'}</span>
                          </span>
                        ))}
                        {dayReservations.length > 3 && <span className="calendar-more">+{dayReservations.length - 3} más</span>}
                        {completedCount > 0 && <span className="calendar-completed-count">{completedCount} {completedCount === 1 ? 'atendido' : 'atendidos'}</span>}
                        {noShowCount > 0 && <span className="calendar-noshow-count">{noShowCount} no vino</span>}
                      </span>
                    ) : (
                      <span className="calendar-month-events">
                        {dayReservations.slice(0, 2).map(reservation => (
                          <span className={`calendar-month-event${reservation.status === 'completed' ? ' is-completed' : ''}${reservation.status === 'no_show' ? ' is-noshow' : ''}`} key={reservation.id}>
                            {new Date(reservation.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
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
      )}
    </section>

    {/* Los turnos del día elegido van en su propia tarjeta: una fila compacta por turno */}
    {!error && <section className="agenda-card calendar-day-detail" aria-live="polite">
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
                <time className="calendar-appointment-time" dateTime={reservation.starts_at}><strong>{clockLabel(date)}</strong></time>
                <span className="calendar-appointment-avatar" aria-hidden="true"><UserRound size={16} /></span>
                <div className="calendar-appointment-info">
                  <strong>{clientName}</strong>
                  <span>{reservation.services?.name ?? 'Servicio'}{showProfessional && reservation.resources ? ` · con ${reservation.resources.name}` : ''}</span>
                </div>
                {reservation.services && <b className="calendar-appointment-price">{formatPrice(Number(reservation.services.price))}</b>}
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
                  {!isCompleted && !isNoShow && <button type="button" className="calendar-cancel" aria-label={`Cancelar turno de ${clientName}`} title="Cancelar turno" onClick={() => onCancel(reservation)}><Trash2 size={15} /></button>}
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
    </section>}
  </>)
}

function clockLabel(date: Date) {
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

// Lo que se edita de un servicio; se guarda todo junto con "Guardar", nunca campo por campo
type ServiceDraft = Pick<Service, 'name' | 'duration_min' | 'price' | 'price_mode' | 'booking_mode' | 'is_active'>

const NEW_SERVICE: ServiceDraft = { name: '', duration_min: 30, price: 0, price_mode: 'fixed', booking_mode: 'online', is_active: true }

function serviceDraft(svc: Service): ServiceDraft {
  return { name: svc.name, duration_min: svc.duration_min, price: Number(svc.price), price_mode: svc.price_mode, booking_mode: svc.booking_mode, is_active: svc.is_active }
}

function sameServiceDraft(a: ServiceDraft, b: ServiceDraft) {
  return a.name === b.name && a.duration_min === b.duration_min && a.price === b.price
    && a.price_mode === b.price_mode && a.booking_mode === b.booking_mode && a.is_active === b.is_active
}

// "20.000" → 20000; corta en `max` dígitos para que no se pueda escribir un número absurdo
function digitsValue(value: string, max: number) {
  return Number(value.replace(/\D/g, '').slice(0, max)) || 0
}

function ServicesSection({ businessId }: { businessId: string }) {
  const { business } = useAuth()
  const [services, setServices] = useState<Service[]>([])
  const [team, setTeam] = useState<Professional[]>([])
  const [offers, setOffers] = useState<ResourceService[]>([])
  const [loaded, setLoaded] = useState(false)
  // El servicio abierto para editar: su id, 'new' si se está agregando uno, o null si se está mirando la lista
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<ServiceDraft>(NEW_SERVICE)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const { confirm, dialog } = useConfirm()

  async function reload() {
    const [loadedServices, loadedTeam, loadedOffers] = await Promise.all([
      listServices(businessId), listProfessionals(businessId), listResourceServices(businessId),
    ])
    setServices(loadedServices)
    setTeam(loadedTeam)
    setOffers(loadedOffers)
    setLoaded(true)
  }
  useEffect(() => { void reload() }, [businessId])

  const editingService = services.find(svc => svc.id === editing) ?? null
  const original = editing === 'new' ? NEW_SERVICE : editingService ? serviceDraft(editingService) : null
  const dirty = original !== null && !sameServiceDraft(draft, original)
  const activeCount = services.filter(svc => svc.is_active).length
  const hiddenCount = services.length - activeCount

  // true si la persona prefiere seguir editando en vez de perder lo que cambió
  async function keepEditing() {
    if (!dirty) return false
    return !(await confirm({
      title: '¿Descartar los cambios?',
      message: 'Lo que cambiaste en este servicio no se va a guardar.',
      confirmLabel: 'Sí, descartar',
      cancelLabel: 'Seguir editando',
    }))
  }

  async function open(target: Service | 'new') {
    if (await keepEditing()) return
    setFormError(null)
    setNotice(null)
    setDraft(target === 'new' ? NEW_SERVICE : serviceDraft(target))
    setEditing(target === 'new' ? 'new' : target.id)
  }

  // Al cerrar, el foco vuelve al botón desde el que se abrió la edición
  function close(id: string | null) {
    setEditing(null)
    setFormError(null)
    requestAnimationFrame(() => {
      const selector = id && id !== 'new' ? `[data-service-edit="${id}"]` : '[data-service-add]'
      document.querySelector<HTMLButtonElement>(selector)?.focus()
    })
  }

  async function cancel() {
    if (await keepEditing()) return
    close(editing)
  }

  function edit(patch: Partial<ServiceDraft>) {
    setDraft(current => ({ ...current, ...patch }))
    setFormError(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    if (editing !== 'new' && !dirty) { close(editing); return }
    const name = draft.name.trim()
    if (!name) { setFormError('Poné el nombre del servicio.'); return }
    if (draft.booking_mode === 'online' && draft.duration_min < 5) { setFormError('La duración tiene que ser de 5 minutos o más.'); return }

    setSaving(true)
    setFormError(null)
    const input = { name, duration_min: draft.duration_min, price: draft.price, price_mode: draft.price_mode, booking_mode: draft.booking_mode }
    let saveError: string | null
    if (editing === 'new') {
      saveError = await createService(businessId, input)
    } else {
      saveError = await updateService(editing, input)
      if (!saveError && editingService && editingService.is_active !== draft.is_active) saveError = await setServiceActive(editing, draft.is_active)
    }
    setSaving(false)
    if (saveError) { setFormError(`No pudimos guardar el servicio: ${saveError}`); return }
    setNotice(editing === 'new' ? `Agregaste ${name}.` : `Guardaste los cambios de ${name}.`)
    await reload()
    close(editing)
  }

  async function removeService(svc: Service) {
    const accepted = await confirm({
      title: `¿Eliminar "${svc.name || 'este servicio'}" para siempre?`,
      message: 'Solo se puede si todavía no tiene reservas; si las tiene, ocultalo.',
      confirmLabel: 'Sí, eliminar',
      cancelLabel: 'No, conservarlo',
      danger: true,
    })
    if (!accepted) return
    setFormError(null)
    const deleteError = await deleteService(svc.id)
    if (deleteError) { setFormError(`No pudimos eliminarlo: ${deleteError}`); return }
    setEditing(null)
    setNotice(`Eliminaste ${svc.name}.`)
    void reload()
  }

  // Un servicio por WhatsApp necesita un número: el del negocio o el de cada profesional que lo hace
  function missingWhatsapp(svc: Service) {
    if (svc.booking_mode !== 'whatsapp' || business?.phone?.trim()) return []
    return team
      .filter(p => p.is_active && !p.whatsapp?.trim() && offers.some(o => o.resource_id === p.id && o.service_id === svc.id))
      .map(p => p.name)
  }

  function serviceForm(svc: Service | null) {
    return <motion.form
      className="service-form"
      aria-label={svc ? `Editar ${svc.name}` : 'Nuevo servicio'}
      noValidate
      onSubmit={event => void save(event)}
      // Se frena el Escape acá: si no, el mismo Escape llega al diálogo de "¿Descartar?" recién abierto y lo cierra
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void cancel() } }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
    >
      <p className="service-form-title">{svc ? 'Editar servicio' : 'Nuevo servicio'}</p>
      <div className="service-form-grid">
        <label className="onboarding-field service-field-name">Nombre
          <input autoFocus maxLength={60} autoComplete="off" placeholder="Ej: Corte de pelo" value={draft.name} onChange={e => edit({ name: field.freeText(e.target.value) })} />
        </label>
        <label className="onboarding-field service-field-booking">Cómo se reserva
          <select value={draft.booking_mode} onChange={e => edit({ booking_mode: e.target.value as Service['booking_mode'] })}>
            <option value="online">Con horario en RESER</option>
            <option value="whatsapp">Se coordina por WhatsApp</option>
          </select>
        </label>
        {draft.booking_mode === 'online' && <label className="onboarding-field service-field-duration">Duración
          <span className="url-field url-field--suffix">
            <input inputMode="numeric" autoComplete="off" value={draft.duration_min || ''} onKeyDown={field.digitsOnlyKeys} onChange={e => edit({ duration_min: digitsValue(e.target.value, 3) })} />
            <span aria-hidden="true">min</span>
          </span>
        </label>}
        <label className="onboarding-field service-field-mode">Precio
          <select value={draft.price_mode} onChange={e => edit({ price_mode: e.target.value as Service['price_mode'] })}>
            <option value="fixed">Precio fijo</option>
            <option value="from">Desde (precio mínimo)</option>
            <option value="ask">A consultar</option>
          </select>
        </label>
        {draft.price_mode !== 'ask' && <label className="onboarding-field service-field-amount">{draft.price_mode === 'from' ? 'Desde' : 'Monto'}
          <span className="url-field">
            <span aria-hidden="true">$</span>
            <input inputMode="numeric" autoComplete="off" placeholder="0" value={draft.price ? draft.price.toLocaleString('es-AR') : ''} onKeyDown={field.digitsOnlyKeys} onChange={e => edit({ price: digitsValue(e.target.value, 9) })} />
          </span>
        </label>}
      </div>
      {svc && <label className="service-visible">
        <input type="checkbox" checked={draft.is_active} onChange={e => edit({ is_active: e.target.checked })} />
        <span><strong>Visible para tus clientes</strong><small>Si lo ocultás no se puede reservar, pero las reservas que ya tiene se conservan.</small></span>
      </label>}
      {formError && <p className="form-error service-form-error" role="alert">{formError}</p>}
      <div className="service-form-actions">
        {svc && <button type="button" className="service-delete" onClick={() => void removeService(svc)}><Trash2 size={14} /> Eliminar servicio</button>}
        <button type="button" className="button button--secondary button--small" onClick={() => void cancel()}>Cancelar</button>
        <button type="submit" className="button button--primary button--small" disabled={saving}>{saving ? 'Guardando…' : svc ? 'Guardar' : 'Agregar'}</button>
      </div>
    </motion.form>
  }

  return <section className="agenda-card services-card">
    {dialog}
    <div className="services-heading">
      <div>
        <h2>Lo que ofrecés</h2>
        {services.length > 0 && <p>{activeCount} {activeCount === 1 ? 'servicio visible' : 'servicios visibles'}{hiddenCount > 0 ? ` · ${hiddenCount} ${hiddenCount === 1 ? 'oculto' : 'ocultos'}` : ''}</p>}
      </div>
      {editing === null && <button type="button" data-service-add className="button button--primary button--small" onClick={() => void open('new')}><Plus size={15} /> Agregar servicio</button>}
    </div>

    {notice && <p className="reservation-form-success services-notice" role="status">{notice}</p>}

    {editing === 'new' && <div className="services-new">{serviceForm(null)}</div>}

    {services.length > 0 && <ul className="services-list">
      <AnimatePresence initial={false}>
        {services.map(svc => {
          const missing = missingWhatsapp(svc)
          return <motion.li
            key={svc.id}
            className={editing === svc.id ? 'is-editing' : undefined}
            layout="position"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
            transition={shouldReduceMotion ? { duration: 0.1 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {editing === svc.id ? serviceForm(svc) : <div className={`service-item${svc.is_active ? '' : ' is-inactive'}`}>
              <div className="service-item-info">
                <strong>{svc.name}</strong>
                <span>
                  {svc.booking_mode === 'whatsapp' ? 'Por WhatsApp' : `${svc.duration_min} min`}
                  {!svc.is_active && <><span aria-hidden="true">·</span><EyeOff size={13} aria-hidden="true" /> Oculto para tus clientes</>}
                </span>
              </div>
              <b className={`service-item-price${svc.price_mode === 'ask' ? ' is-ask' : ''}`}>{priceLabel(Number(svc.price), svc.price_mode)}</b>
              <button type="button" className="service-edit" data-service-edit={svc.id} aria-label={`Editar ${svc.name}`} onClick={() => void open(svc)}>
                <Pencil size={14} aria-hidden="true" /><span>Editar</span>
              </button>
              {missing.length > 0 && <p className="service-item-warning">
                <TriangleAlert size={14} aria-hidden="true" />
                <span>Falta el WhatsApp de {missing.join(', ')}: sus clientes no van a poder escribirle. Cargalo en Equipo.</span>
              </p>}
            </div>}
          </motion.li>
        })}
      </AnimatePresence>
    </ul>}

    {loaded && services.length === 0 && editing !== 'new' && <div className="services-empty">
      <strong>Todavía no cargaste servicios</strong>
      <small>Agregá lo que ofrecés con su duración y su precio: es lo que tus clientes eligen al reservar.</small>
    </div>}
  </section>
}

function ConfigSection({ businessId, onSaved }: { businessId: string; onSaved: () => Promise<void> }) {
  const { business } = useAuth()
  const [name, setName] = useState(business?.name ?? '')
  const [slug, setSlug] = useState(business?.slug ?? '')
  const [cancelHours, setCancelHours] = useState(business?.cancel_min_hours ?? 2)
  const [phone, setPhone] = useState(business?.phone ?? '')
  const [address, setAddress] = useState(business?.address ?? '')
  const [logoBusy, setLogoBusy] = useState(false)
  const [minNotice, setMinNotice] = useState(business?.min_notice_hours ?? 1)
  const [maxAdvance, setMaxAdvance] = useState(business?.max_advance_days ?? 60)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancelOptions = [...new Set([0, 1, 2, 4, 12, 24, 48, 72, cancelHours])].sort((a, b) => a - b)
  const noticeOptions = [...new Set([0, 1, 2, 4, 12, 24, 48, minNotice])].sort((a, b) => a - b)
  const advanceOptions = [...new Set([7, 14, 30, 60, 90, 180, maxAdvance])].sort((a, b) => a - b)

  async function changeLogo(file: File | undefined) {
    if (!file) return
    setLogoBusy(true)
    setMessage(null)
    const logoError = await uploadBusinessLogo(businessId, file, business?.logo_path ?? null)
    setLogoBusy(false)
    if (logoError) { setMessage(logoError); return }
    await onSaved()
    setMessage('Logo actualizado ✓')
  }

  async function clearLogo() {
    setLogoBusy(true)
    setMessage(null)
    const logoError = await removeBusinessLogo(businessId, business?.logo_path ?? null)
    setLogoBusy(false)
    if (logoError) { setMessage(logoError); return }
    await onSaved()
    setMessage('Logo quitado.')
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    const error = await updateBusiness(businessId, { name: name.trim(), slug: slugify(slug), cancel_min_hours: cancelHours, min_notice_hours: minNotice, max_advance_days: maxAdvance, phone: phone.trim() || null, address: address.trim() || null })
    setBusy(false)
    if (error) { setMessage(error); return }
    await onSaved()
    setMessage('Cambios guardados ✓')
  }

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Configuración</p><h2>Tu negocio</h2></div></div>
    <label className="onboarding-field">Nombre del negocio
      <input value={name} onChange={e => setName(field.freeText(e.target.value))} />
    </label>
    <label className="onboarding-field">Tu enlace de RESER
      <div className="url-field"><span>{window.location.host}/</span><input value={slug} onChange={e => setSlug(field.slugText(e.target.value))} /></div>
    </label>
    <p className="eyebrow" style={{ marginTop: 20 }}>Lo que ven tus clientes</p>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0 14px', flexWrap: 'wrap' }}>
      <span className="mini-logo" aria-hidden="true" style={{ width: 56, height: 56, ...(logoUrl(business?.logo_path) ? { backgroundImage: `url(${logoUrl(business?.logo_path)})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : {}) }}>{initials(name)}</span>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="button button--secondary button--small" style={{ cursor: logoBusy ? 'wait' : 'pointer' }}>
            {logoBusy ? 'Subiendo…' : business?.logo_path ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" hidden disabled={logoBusy} accept="image/png,image/jpeg,image/webp" onChange={e => { void changeLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {business?.logo_path && <button type="button" className="text-button" disabled={logoBusy} onClick={() => void clearLogo()}>Quitar</button>}
        </div>
        <small style={{ color: 'var(--text-3)' }}>PNG, JPG o WebP, hasta 10 MB: la ajustamos sola. Funciona mejor si es cuadrado.</small>
      </div>
    </div>
    <label className="onboarding-field">Teléfono <small>(opcional)</small>
      <input type="tel" inputMode="tel" maxLength={40} autoComplete="off" placeholder="11 5555 5555" value={phone} onChange={e => setPhone(field.phone(e.target.value))} />
    </label>
    <label className="onboarding-field">Dirección <small>(opcional)</small>
      <input maxLength={160} autoComplete="off" placeholder="Calle 123, Ciudad" value={address} onChange={e => setAddress(field.address(e.target.value))} />
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
    {message && <p className="form-note">{message}</p>}
    <button className="button button--primary" style={{ marginTop: 16 }} disabled={busy} onClick={() => void save()}>
      {busy ? 'Guardando…' : 'Guardar cambios'}
    </button>
  </section>
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (await copyText(bookingUrl(slug))) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } else {
      window.prompt('Copiá el enlace de reservas:', bookingUrl(slug))
    }
  }
  return <button type="button" className="icon-button" style={{ marginLeft: 'auto', width: 30, height: 30 }} aria-label={copied ? 'Enlace copiado' : 'Copiar enlace de reservas'} title={copied ? 'Copiado' : 'Copiar enlace de reservas'} onClick={() => void copy()}>
    {copied ? <Check size={15} /> : <Copy size={15} />}
  </button>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong><CountUp value={value} /></strong><small>{detail}</small></div></div>
}

// El número de una métrica cuenta hacia arriba hasta su valor ("80%" → 0…80%). Con "reducir movimiento" se muestra directo.
function CountUp({ value }: { value: string }) {
  const match = /^(\d+)(.*)$/.exec(value)
  const target = match ? Number(match[1]) : null
  const suffix = match ? match[2] : ''
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(() => (target === null || reduceMotion ? target : 0))
  // Si el valor cambia (llegó una reserva), cuenta desde el número que ya se veía, no desde cero
  const fromRef = useRef(0)
  useEffect(() => {
    if (target === null) return
    if (reduceMotion) { setShown(target); fromRef.current = target; return }
    const controls = animate(fromRef.current, target, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: latest => { fromRef.current = latest; setShown(Math.round(latest)) },
    })
    return () => controls.stop()
  }, [target, reduceMotion])
  return <>{target === null ? value : `${shown ?? target}${suffix}`}</>
}
