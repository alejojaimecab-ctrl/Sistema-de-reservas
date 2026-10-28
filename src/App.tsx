import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { ArrowRight, BellRing, CalendarCheck2, Camera, CheckCheck, ChevronLeft, ChevronRight, CirclePlay, Clock3, Mic, Phone, Plus, ShieldCheck, Video, WandSparkles } from 'lucide-react'
import { Brand } from './components/Brand'
import { ScrollBrand } from './components/ScrollBrand'
import { Reveal } from './components/Reveal'
import { PricingSection } from './components/Pricing'
import { AuthProvider, useAuth } from './lib/auth'
import { cancelTokenFromPath, GO_HOME_EVENT, goTo, joinTokenFromPath, legalDocFromPath, panelSectionFromPath, slugFromPath } from './lib/routes'
import { HOME_TITLE, usePageMeta, type PageMeta } from './lib/pageMeta'
import { effectivePlan } from './lib/plans'

type View = 'home' | 'public-booking' | 'cancel' | 'join' | 'legal' | 'demo-booking' | 'dashboard' | 'onboarding' | 'login'

// public-booking (usa el nombre del negocio) y legal (cada documento) declaran su propio título
const PAGE_META: Partial<Record<View, PageMeta>> = {
  home: { title: HOME_TITLE },
  'demo-booking': { title: 'Ejemplo de reserva · RESER', noindex: true },
  cancel: { title: 'Cancelar turno · RESER', noindex: true },
  join: { title: 'Sumarte a un equipo · RESER', noindex: true },
  dashboard: { title: 'Panel · RESER', noindex: true },
  login: { title: 'Iniciar sesión · RESER', noindex: true },
  onboarding: { title: 'Crear mi negocio · RESER', noindex: true },
}
const RESET_PASSWORD_META: PageMeta = { title: 'Nueva contraseña · RESER', noindex: true }

const BookingExperience = lazy(() =>
  import('./components/BookingExperience').then(module => ({ default: module.BookingExperience })),
)
const OwnerDashboard = lazy(() =>
  import('./components/OwnerDashboard').then(module => ({ default: module.OwnerDashboard })),
)
const ResetPassword = lazy(() =>
  import('./components/ResetPassword').then(module => ({ default: module.ResetPassword })),
)
const LegalPage = lazy(() =>
  import('./components/LegalPage').then(module => ({ default: module.LegalPage })),
)
const CancelBooking = lazy(() =>
  import('./components/CancelBooking').then(module => ({ default: module.CancelBooking })),
)
const JoinTeam = lazy(() =>
  import('./components/JoinTeam').then(module => ({ default: module.JoinTeam })),
)
const Onboarding = lazy(() =>
  import('./components/Onboarding').then(module => ({ default: module.Onboarding })),
)
const Login = lazy(() =>
  import('./components/Login').then(module => ({ default: module.Login })),
)
const MfaChallenge = lazy(() =>
  import('./components/MfaChallenge').then(module => ({ default: module.MfaChallenge })),
)

// Funciones de la portada, según el diseño del dueño: etiqueta, título con serif, texto y un fragmento de la interfaz
const features = [
  { label: 'Agenda', title: 'Agenda sin cruces', text: 'RESER muestra únicamente horarios realmente disponibles.', fragment: 'agenda' },
  { label: 'Recordatorios', title: 'Recordatorios que llegan', text: 'Confirmación por mail apenas reservan y, en Básico y Pro, un recordatorio 1 h antes.', fragment: 'mail' },
  { label: 'Mis turnos', title: 'Hecho para tu negocio', text: 'Servicios, precios y horarios con tu propia forma de trabajar.', fragment: 'services' },
] as const

// Fragmentos de la interfaz real (con datos de ejemplo) que acompañan cada función de la portada
function FeatureFragment({ kind }: { kind: (typeof features)[number]['fragment'] }) {
  if (kind === 'agenda') return <div className="fragment fragment-agenda" aria-hidden="true">
    <div className="fragment-slots">
      {['08:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'].map(time =>
        <span key={time} className={time === '10:00' ? 'is-picked' : undefined}>{time}</span>)}
    </div>
    <small>Los horarios ocupados no se ofrecen</small>
  </div>
  if (kind === 'mail') return <div className="fragment fragment-mail" aria-hidden="true">
    <div className="fragment-mail-head"><span className="fragment-avatar">R</span><span><strong>RESER</strong><small>Recordatorio · hace un momento</small></span></div>
    <p><strong>Tu turno es en 1 hora</strong><span>Servicio 1 · hoy, 10:30</span></p>
  </div>
  return <div className="fragment fragment-services" aria-hidden="true">
    {[['Servicio 1', '30 min', '$ 15.000'], ['Servicio 2', '45 min', '$ 20.000'], ['Servicio 3', 'Por WhatsApp', 'A consultar']].map(([name, detail, price]) =>
      <span key={name}><strong>{name}</strong><small>{detail}</small><b>{price}</b><ChevronRight size={16} /></span>)}
  </div>
}

// Conversación de ejemplo vista desde el WhatsApp del negocio: el cliente escribe (izquierda) y el dueño responde (derecha)
const storyChat = [
  { text: '¿Tenés turno mañana a la tarde?', time: '19:49', out: false },
  { text: 'A las 17 tengo, ¿te sirve?', time: '19:49', out: true },
  { text: 'Mejor a las 18… ah, ¿ya se ocupó?', time: '19:51', out: false },
  { text: 'Sí, perdón. ¿Te anoto el jueves?', time: '19:52', out: true },
]
const storyAgenda = [
  ['Mañana 17:00', 'Lucía F. · Servicio 1', 'Confirmada'],
  ['Jue 10:30', 'Bruno A. · Servicio 2', 'Confirmada'],
  ['Vie 18:00', 'Carla M. · Servicio 1', 'Recordatorio enviado'],
  ['Vie 19:00', 'Daira · Servicio 2', 'Confirmada'],
  ['Sáb 10:30', 'Nico P. · Servicio 3', 'Confirmada'],
]
const storyList = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }
const storyItem = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const } } }

export default function App() {
  return (
    <AuthProvider>
      {/* "Reducir movimiento" del sistema: motion deja de mover y escalar (los fundidos y estados siguen) */}
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<AppLoading />}>
          <Root />
        </Suspense>
      </MotionConfig>
    </AuthProvider>
  )
}

function AppLoading() {
  return <main className="app-loading" role="status" aria-live="polite">
    <span aria-hidden="true" />
    Cargando RESER…
  </main>
}

function Root() {
  const [publicSlug, setPublicSlug] = useState(() => slugFromPath(window.location.pathname))
  const [cancelToken, setCancelToken] = useState(() => cancelTokenFromPath(window.location.pathname))
  const [legalDoc, setLegalDoc] = useState(() => legalDocFromPath(window.location.pathname))
  const [joinToken, setJoinToken] = useState(() => joinTokenFromPath(window.location.pathname))
  const [view, setView] = useState<View>(() => legalDoc ? 'legal' : cancelToken ? 'cancel' : joinToken ? 'join' : publicSlug ? 'public-booking' : panelSectionFromPath(window.location.pathname) !== null ? 'dashboard' : 'home')
  const { session, loading, recovering, mfaPending, business } = useAuth()
  // Las líneas finas de la portada y del ingreso son doradas solo para un negocio en Pro (o en su prueba); grises para el resto
  const isPro = Boolean(session && business && effectivePlan(business) === 'pro')
  useEffect(() => { document.documentElement.classList.toggle('is-pro', isPro) }, [isPro])
  const prevSession = useRef<typeof session | undefined>(undefined)
  // Lo que se ve depende también de la sesión: "login" con sesión muestra el panel y "dashboard" sin sesión muestra el login
  const shownView: View = view === 'login' && session ? 'dashboard' : view === 'dashboard' && !session ? 'login' : view
  usePageMeta(loading ? null : recovering && session ? RESET_PASSWORD_META : PAGE_META[shownView] ?? null)

  // Botones atrás/adelante del navegador: la URL manda sobre la vista pública.
  useEffect(() => {
    const onPop = () => {
      const slug = slugFromPath(window.location.pathname)
      const token = cancelTokenFromPath(window.location.pathname)
      const doc = legalDocFromPath(window.location.pathname)
      const join = joinTokenFromPath(window.location.pathname)
      const panel = panelSectionFromPath(window.location.pathname) !== null
      setPublicSlug(slug)
      setCancelToken(token)
      setLegalDoc(doc)
      setJoinToken(join)
      setView(v => doc ? 'legal' : token ? 'cancel' : join ? 'join' : slug ? 'public-booking' : panel ? 'dashboard' : (v === 'public-booking' || v === 'cancel' || v === 'join' || v === 'legal' || v === 'dashboard') ? 'home' : v)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const leavePublicBooking = () => {
    goTo('/')
    setPublicSlug(null)
    setCancelToken(null)
    setLegalDoc(null)
    setJoinToken(null)
    setView('home')
  }

  // Tocar el logo de RESER desde cualquier pantalla (login, alta, panel, páginas legales) vuelve a la portada, arriba de todo
  useEffect(() => {
    const onHome = () => { leavePublicBooking(); window.scrollTo({ top: 0 }) }
    window.addEventListener(GO_HOME_EVENT, onHome)
    return () => window.removeEventListener(GO_HOME_EVENT, onHome)
  }, [])

  // Cuando aparece una sesión nueva (login, o al volver del email de confirmación),
  // llevar al usuario directo al dashboard.
  useEffect(() => {
    if (loading) return
    if (prevSession.current === null && session) {
      setView(v => (v === 'home' || v === 'login' || v === 'onboarding') ? 'dashboard' : v)
    }
    prevSession.current = session
  }, [session, loading])

  // El panel vive en /panel (la sección la agrega OwnerDashboard): así recargar no lo saca del panel.
  // Al salir del panel a la portada, la dirección vuelve a "/".
  useEffect(() => {
    if (loading) return
    const inPanel = panelSectionFromPath(window.location.pathname) !== null
    if (shownView === 'dashboard' && !inPanel) goTo('/panel')
    else if (shownView === 'home' && inPanel) goTo('/')
  }, [shownView, loading])

  // Mientras se confirma la sesión: un aviso tranquilo que solo aparece si tarda (así no parpadea cuando es rápido)
  if (loading) return <div className="app-loading" role="status"><span className="app-loading-dot" aria-hidden="true" />Cargando…</div>
  // Con la verificación en dos pasos activada, nada del panel (ni elegir contraseña nueva) antes del código
  if (mfaPending && session && (recovering || ['dashboard', 'login', 'onboarding', 'join'].includes(view))) return <MfaChallenge />
  if (recovering && session) return <ResetPassword onDone={() => setView('dashboard')} />
  if (view === 'legal' && legalDoc) return <LegalPage doc={legalDoc} onBack={leavePublicBooking} onOpen={doc => { goTo(`/${doc}`); setLegalDoc(doc) }} />
  if (view === 'cancel' && cancelToken) return <CancelBooking key={cancelToken} token={cancelToken} onBack={leavePublicBooking} />
  if (view === 'join' && joinToken) return <JoinTeam key={joinToken} token={joinToken} onBack={leavePublicBooking} onJoined={() => { goTo('/'); setJoinToken(null); setView('dashboard') }} />
  if (view === 'public-booking' && publicSlug) return <BookingExperience key={publicSlug} slug={publicSlug} onBack={leavePublicBooking} />
  if (view === 'demo-booking') return <BookingExperience demo onBack={() => setView('home')} onCreateBusiness={() => setView('onboarding')} />
  if (view === 'dashboard') {
    if (!session) return <Login onBack={() => setView('home')} onCreateAccount={() => { goTo('/'); setView('onboarding') }} />
    return <OwnerDashboard onExit={() => setView('home')} />
  }
  if (view === 'login') {
    if (session) return <OwnerDashboard onExit={() => setView('home')} />
    return <Login onBack={() => setView('home')} onCreateAccount={() => { goTo('/'); setView('onboarding') }} />
  }
  if (view === 'onboarding') return <Onboarding onBack={() => setView('home')} onFinish={() => setView('dashboard')} />

  return <main className="site-shell">
    <nav className="site-nav"><ScrollBrand /><div className="nav-actions"><a href="#como-funciona">Cómo funciona</a><a href="#precios">Precios</a><button className="text-button" onClick={() => setView('login')}>{session ? 'Mi panel' : 'Iniciar sesión'}</button><button className="button button--pill button--small" onClick={() => setView('onboarding')}>Crear mi negocio <ArrowRight size={16} /></button></div></nav>
    <section className="hero"><div className="hero-copy"><motion.div className="hero-badge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><CalendarCheck2 size={14} /> Reservas simples para negocios reales</motion.div><motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.65 }}>Tu tiempo vale.<br /><em>Hacelo rendir.</em></motion.h1><motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.65 }}>RESER organiza tus turnos, confirma a tus clientes y te devuelve el control de tu agenda.</motion.p><motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.65 }}><button className="button button--primary button--large" onClick={() => setView('onboarding')}>Crear mi negocio <ArrowRight size={18} /></button><button className="button button--ghost button--large" onClick={() => setView('demo-booking')}><CirclePlay size={19} /> Ver una reserva</button></motion.div><motion.div className="hero-proof" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}><p><strong>Una agenda más clara</strong><br />para cualquier tipo de negocio.</p></motion.div></div>
      <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.94, y: 28 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}><div className="showcase-window"><div className="showcase-top"><span className="mini-logo">TN</span><span>Tu Negocio</span><i /><small>Vista de ejemplo</small></div><div className="showcase-content"><p className="eyebrow">Tu agenda hoy</p><h2>2 reservas confirmadas</h2><div className="showcase-booking"><span className="avatar">LF</span><div><strong>Lucía Fernández</strong><small>Servicio 1 · 09:30</small></div><span className="booking-status">Confirmada</span></div><div className="showcase-booking showcase-booking--muted"><span className="avatar">BA</span><div><strong>Bruno Acosta</strong><small>Servicio 2 · 10:30</small></div><span>En 1 h</span></div></div></div><motion.div className="floating-card floating-card--reminder" animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}><span><BellRing size={17} /></span><p><strong>Recordatorio enviado</strong><small>Lucía · hace un momento</small></p></motion.div><motion.div className="floating-card floating-card--calendar" animate={{ y: [0, 7, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}><CalendarCheck2 size={20} /><strong>Agenda al día</strong></motion.div></motion.div>
    </section>
    <section className="trust-strip"><span><ShieldCheck size={18} /> Datos protegidos</span><span><Clock3 size={18} /> Horarios en tiempo real</span><span><WandSparkles size={18} /> Configuración en minutos</span></section>
    <section className="story-section" aria-labelledby="story-title">
      <Reveal><h2 id="story-title">Del ida y vuelta por WhatsApp<br /><em>a una agenda que se ordena sola.</em></h2></Reveal>
      <div className="story-grid">
        <div className="story-panel story-panel--before">
          <p className="story-label">Hoy, por WhatsApp</p>
          <h3>Ida y vuelta</h3>
          {/* Pantalla de WhatsApp de ejemplo (con sus colores a propósito: es el "antes") */}
          <div className="wa-chat">
            <div className="wa-header" aria-hidden="true">
              <span className="wa-back"><ChevronLeft size={22} />1</span>
              <span className="wa-avatar">LF</span>
              <span className="wa-contact"><strong>Lucía F.</strong><small>en línea</small></span>
              <Video size={20} />
              <Phone size={18} />
            </div>
            <motion.ul className="wa-messages" variants={storyList} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
              {storyChat.map(({ text, time, out }) => <motion.li key={text} variants={storyItem} className={out ? 'is-out' : 'is-in'}>
                {text}<span className="wa-meta">{time}{out && <CheckCheck size={15} aria-label="leído" />}</span>
              </motion.li>)}
            </motion.ul>
            <div className="wa-input" aria-hidden="true"><Plus size={20} /><span /><Camera size={19} /><Mic size={19} /></div>
          </div>
        </div>
        <span className="story-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
        <div className="story-panel story-panel--after">
          <p className="story-label">Con RESER</p>
          <h3>Agenda que se ordena sola</h3>
          <motion.ul className="story-agenda" variants={storyList} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
            {storyAgenda.map(([when, who, state]) => <motion.li key={when} variants={storyItem}><time>{when}</time><span>{who}</span><b>{state}</b></motion.li>)}
          </motion.ul>
        </div>
      </div>
    </section>
    <section id="como-funciona" className="feature-section"><Reveal><p className="eyebrow">Pensado para que funcione solo</p><h2>Menos coordinación.<br />Más tiempo para tu trabajo.</h2></Reveal><div className="feature-grid feature-grid--bento">{features.map(({ label, title, text, fragment }, index) => <Reveal key={title} delay={index * 0.08}><article className={`feature-panel feature-panel--${fragment}`}><div className="feature-panel-copy"><p className="feature-panel-label">{label}</p><h3>{title}</h3><p>{text}</p></div><FeatureFragment kind={fragment} /></article></Reveal>)}</div></section>
    <PricingSection onStart={() => setView('onboarding')} />
    <section className="cta-section"> <Reveal><div><p className="eyebrow">Tu agenda, a tu manera</p><h2>Tu negocio merece<br /><em>una mejor reserva.</em></h2><p>Configurá RESER en minutos y compartí tu enlace cuando estés listo.</p><button className="button button--primary button--large" onClick={() => setView('onboarding')}>Crear mi negocio <ArrowRight size={18} /></button></div></Reveal><span className="cta-decoration" aria-hidden="true"><CalendarCheck2 size={160} /></span></section>
    <footer><Brand compact inverse /><span>© 2026 RESER. Hecho para negocios que valoran su tiempo.<span className="site-footer-links"><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></span></span></footer>
  </main>
}
