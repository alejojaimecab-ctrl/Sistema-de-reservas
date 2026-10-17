import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BellRing, CalendarCheck2, CirclePlay, Clock3, Layers3, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { Brand } from './components/Brand'
import { ScrollBrand } from './components/ScrollBrand'
import { Reveal } from './components/Reveal'
import { AuthProvider, useAuth } from './lib/auth'

type View = 'home' | 'booking' | 'demo-booking' | 'dashboard' | 'onboarding' | 'login'

const BookingExperience = lazy(() =>
  import('./components/BookingExperience').then(module => ({ default: module.BookingExperience })),
)
const OwnerDashboard = lazy(() =>
  import('./components/OwnerDashboard').then(module => ({ default: module.OwnerDashboard })),
)
const Onboarding = lazy(() =>
  import('./components/Onboarding').then(module => ({ default: module.Onboarding })),
)
const Login = lazy(() =>
  import('./components/Login').then(module => ({ default: module.Login })),
)

const features = [
  { icon: CalendarCheck2, title: 'Agenda sin cruces', text: 'RESER muestra únicamente horarios realmente disponibles.' },
  { icon: BellRing, title: 'Recordatorios que llegan', text: 'Confirmaciones y avisos para que no se te escape ningún turno.' },
  { icon: Layers3, title: 'Hecho para tu negocio', text: 'Servicios, precios y horarios con tu propia forma de trabajar.' },
]

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<AppLoading />}>
        <Root />
      </Suspense>
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
  const [view, setView] = useState<View>('home')
  const { session, loading } = useAuth()
  const prevSession = useRef<typeof session | undefined>(undefined)

  // Cuando aparece una sesión nueva (login, o al volver del email de confirmación),
  // llevar al usuario directo al dashboard.
  useEffect(() => {
    if (loading) return
    if (prevSession.current === null && session) {
      setView(v => (v === 'home' || v === 'login' || v === 'onboarding') ? 'dashboard' : v)
    }
    prevSession.current = session
  }, [session, loading])

  if (loading) return null
  if (view === 'booking') return <BookingExperience onBack={() => setView('home')} />
  if (view === 'demo-booking') return <BookingExperience demo onBack={() => setView('home')} />
  if (view === 'dashboard') {
    if (!session) return <Login onBack={() => setView('home')} />
    return <OwnerDashboard onExit={() => setView('home')} />
  }
  if (view === 'login') {
    if (session) return <OwnerDashboard onExit={() => setView('home')} />
    return <Login onBack={() => setView('home')} />
  }
  if (view === 'onboarding') return <Onboarding onBack={() => setView('home')} onFinish={() => setView('dashboard')} />

  return <main className="site-shell">
    <div className="ambient ambient--one" /><div className="ambient ambient--two" />
    <nav className="site-nav"><ScrollBrand /><div className="nav-actions"><a href="#como-funciona">Cómo funciona</a><button className="text-button" onClick={() => setView('login')}>Iniciar sesión</button><button className="button button--primary button--small" onClick={() => setView('onboarding')}>Crear mi negocio <ArrowRight size={16} /></button></div></nav>
    <section className="hero"><div className="hero-copy"><motion.div className="hero-badge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><Sparkles size={14} /> Reservas simples para negocios reales</motion.div><motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.65 }}>Tu tiempo vale.<br /><em>Hacelo rendir.</em></motion.h1><motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.65 }}>RESER organiza tus turnos, confirma a tus clientes y te devuelve el control de tu agenda.</motion.p><motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.65 }}><button className="button button--primary button--large" onClick={() => setView('onboarding')}>Empezar gratis <ArrowRight size={18} /></button><button className="button button--ghost button--large" onClick={() => setView('demo-booking')}><CirclePlay size={19} /> Ver una reserva</button></motion.div><motion.div className="hero-proof" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}><div className="proof-avatars"><span>MF</span><span>BA</span><span>LS</span></div><p><strong>Una agenda más clara</strong><br />para cualquier tipo de negocio.</p></motion.div></div>
      <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.94, y: 28 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}><div className="visual-glow" /><div className="showcase-window"><div className="showcase-top"><span className="mini-logo">TN</span><span>Tu Negocio</span><i /><small>Hoy, martes 15</small></div><div className="showcase-content"><p className="eyebrow">Tu agenda hoy</p><h2>4 reservas confirmadas</h2><div className="showcase-booking"><span className="avatar avatar--blue">LF</span><div><strong>Lucía Fernández</strong><small>Servicio 1 · 09:30</small></div><span className="booking-status">Confirmada</span></div><div className="showcase-booking showcase-booking--muted"><span className="avatar avatar--violet">BA</span><div><strong>Bruno Acosta</strong><small>Servicio 2 · 10:30</small></div><span>En 1 h</span></div></div></div><motion.div className="floating-card floating-card--reminder" animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}><span><BellRing size={17} /></span><p><strong>Recordatorio enviado</strong><small>Lucía · hace un momento</small></p></motion.div><motion.div className="floating-card floating-card--calendar" animate={{ y: [0, 7, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}><CalendarCheck2 size={20} /><strong>Agenda al día</strong></motion.div></motion.div>
    </section>
    <section className="trust-strip"><span><ShieldCheck size={18} /> Datos protegidos</span><span><Clock3 size={18} /> Horarios en tiempo real</span><span><WandSparkles size={18} /> Configuración en minutos</span></section>
    <section id="como-funciona" className="feature-section"><Reveal><p className="eyebrow">Pensado para que funcione solo</p><h2>Menos coordinación.<br />Más tiempo para tu trabajo.</h2></Reveal><div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <Reveal key={title} delay={index * 0.1}><article className="feature-card"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p><i>0{index + 1}</i></article></Reveal>)}</div></section>
    <section className="cta-section"> <Reveal><div><p className="eyebrow">Tu agenda, a tu manera</p><h2>Tu negocio merece<br /><em>una mejor reserva.</em></h2><p>Configurá RESER en minutos y compartí tu enlace cuando estás listo.</p><button className="button button--light button--large" onClick={() => setView('onboarding')}>Crear mi negocio <ArrowRight size={18} /></button></div></Reveal><span className="cta-decoration" aria-hidden="true"><CalendarCheck2 size={160} /></span></section>
    <footer><Brand compact inverse /><span>© 2026 RESER. Hecho para negocios que valoran su tiempo.</span></footer>
  </main>
}
