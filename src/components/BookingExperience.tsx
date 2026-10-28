import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarDays, MapPin, MessageCircle, Phone, Check, ChevronLeft, ChevronRight, CirclePlay, Mail, PencilLine, UserRound, UsersRound } from 'lucide-react'
import { demoServices, priceLabel } from '../data/demo'
import { bookPublic, getPublicPage, getPublicSlots, type PublicBusiness, type PublicProfessional, type PublicService, type ResourceService } from '../lib/db'
import { logoUrl } from '../lib/db'
import { addressForMaps } from '../lib/address'
import { SuccessCheck } from './SuccessCheck'
import { GreenWipe } from './GreenWipe'
import { AutoHeight } from './AutoHeight'
import { useReduceMotion } from '../lib/motion'
import { usePageMeta } from '../lib/pageMeta'
import { cancelUrl, mapsUrl, telHref, whatsappHref } from '../lib/routes'
import { email as cleanEmail, personName } from '../lib/fieldRules'

const dayLabel = (d: Date) =>
  d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase())
const fullDayLabel = (d: Date) =>
  d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// Zona horaria de los negocios (columna businesses.timezone). Hoy todos usan la de Argentina y la vista pública
// no la expone; si algún día se puede elegir, hay que sumarla a public_businesses y usar la del negocio acá.
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

// Entrada escalonada de la pantalla de reserva confirmada (arranca cuando termina el tilde)
const successStagger = { hidden: {}, show: { transition: { delayChildren: 1.25, staggerChildren: 0.09 } } }
const successRise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

const demoBusiness: PublicBusiness = { slug: 'demo', name: 'Tu Negocio', cancel_min_hours: 2, min_notice_hours: 1, max_advance_days: 60, phone: null, address: null, logo_path: null }
const demoProfessionals: PublicProfessional[] = [{ id: 'demo-1', name: 'Martín', whatsapp: null }, { id: 'demo-2', name: 'Daira', whatsapp: null }]
const previewServices: PublicService[] = demoServices.map(({ id, name, duration, price }) => ({
  id,
  business_slug: demoBusiness.slug,
  name,
  duration_min: duration,
  price,
  price_mode: 'fixed',
  booking_mode: 'online',
}))

function previewSlots(date: Date) {
  return [[9, 30], [10, 30], [11, 30], [13, 0], [14, 30]].map(([hour, minute]) => {
    const slot = new Date(date)
    slot.setHours(hour, minute, 0, 0)
    return slot.toISOString()
  }).filter(slot => new Date(slot).getTime() > Date.now())
}

export function BookingExperience({ onBack, demo = false, slug }: { onBack: () => void; demo?: boolean; slug?: string }) {
  const [step, setStep] = useState(1)
  const [business, setBusiness] = useState<PublicBusiness | null>(null)
  const [services, setServices] = useState<PublicService[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [service, setService] = useState<PublicService | null>(null)
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([])
  const [offers, setOffers] = useState<ResourceService[]>([]) // qué servicio ofrece cada profesional
  const [professionalId, setProfessionalId] = useState('') // '' = cualquiera
  const [bookedWith, setBookedWith] = useState<string | null>(null)
  const [cancelToken, setCancelToken] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string }>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const [dateIndex, setDateIndex] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  // Mientras el cliente no elija un día a mano, se salta solo hasta el primero que tenga horarios (como mucho dos semanas)
  const autoPickRef = useRef(true)
  const [skippedDays, setSkippedDays] = useState(0)
  const pickDate = (offset: number, index: number) => { autoPickRef.current = false; setSkippedDays(0); setWeekOffset(offset); setDateIndex(index) }
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [slotsFailed, setSlotsFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [slotsRetry, setSlotsRetry] = useState(0)
  const reduceMotion = useReduceMotion()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  // Transición verde al confirmar: nace en el botón, llena la tarjeta y se recoge hacia el tilde
  const [wipe, setWipe] = useState<{ x: number; y: number; phase: 'cover' | 'reveal' } | null>(null)

  // Al cambiar de paso, si el borde de arriba de la tarjeta quedó fuera de la pantalla (en el celular), vuelve a mostrarse
  const firstStepRef = useRef(true)
  useEffect(() => {
    if (firstStepRef.current) { firstStepRef.current = false; return }
    const card = cardRef.current
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [step])

  // La pestaña y los buscadores muestran el nombre del negocio; si no existe o no cargó, no se indexa
  usePageMeta(demo || loadingServices ? null : business
    ? { title: `${business.name} · Reservá tu turno`, description: `Reservá tu turno online en ${business.name}. Elegí el servicio, el profesional y el horario que te quede mejor.` }
    : { title: 'Reservá tu turno · RESER', noindex: true })

  // Ventana de 5 días; weekOffset la desplaza de a 5 días hacia adelante/atrás
  const dates = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 5 + i)
    return d
  }), [weekOffset])
  const date = dates[dateIndex]
  const maxDays = business?.max_advance_days ?? 60 // hasta cuántos días adelante deja reservar el negocio

  // Solo los profesionales que ofrecen el servicio elegido
  const serviceProfessionals = useMemo(() => professionals.filter(p =>
    offers.some(o => o.resource_id === p.id && o.service_id === service?.id)), [professionals, offers, service])

  useEffect(() => {
    if (professionalId && !serviceProfessionals.some(p => p.id === professionalId)) setProfessionalId('')
  }, [serviceProfessionals, professionalId])

  // Servicios por WhatsApp: no hay agenda, así que se escribe directo al profesional elegido.
  const isWhatsapp = service?.booking_mode === 'whatsapp'
  useEffect(() => {
    if (isWhatsapp && !professionalId && serviceProfessionals.length > 1) setProfessionalId(serviceProfessionals[0].id)
  }, [isWhatsapp, professionalId, serviceProfessionals])
  const waNumber = serviceProfessionals.find(p => p.id === professionalId)?.whatsapp
    || (serviceProfessionals.length === 1 ? serviceProfessionals[0].whatsapp : null)
    || business?.phone
    || null
  const waName = serviceProfessionals.find(p => p.id === professionalId)?.name
    ?? (serviceProfessionals.length === 1 ? serviceProfessionals[0].name : null)
  const waHref = isWhatsapp && waNumber && business && service
    ? whatsappHref(waNumber, `Hola, vi la agenda de ${business.name} en RESER y quiero consultar por ${service.name}.`)
    : null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (demo) {
        setBusiness(demoBusiness)
        setServices(previewServices)
        setProfessionals(demoProfessionals)
        setOffers(demoProfessionals.flatMap(p => previewServices.map(s => ({ resource_id: p.id, service_id: s.id }))))
        setService(previewServices.length === 1 ? previewServices[0] : null)
        setLoadingServices(false)
        return
      }
      if (!slug) { setLoadingServices(false); return }
      const page = await getPublicPage(slug)
      if (cancelled) return
      if (page.failed) { setLoadFailed(true); setLoadingServices(false); return }
      setBusiness(page.business)
      setOffers(page.offers)
      setServices(page.services)
      // Con un solo servicio no hay nada que elegir; con varios, el cliente elige (antes se marcaba el primero y se podía avanzar sin mirar)
      setService(page.services.length === 1 ? page.services[0] : null)
      setProfessionals(page.professionals)
      setLoadingServices(false)
    })()
    return () => { cancelled = true }
  }, [demo, slug, retryCount])

  useEffect(() => {
    autoPickRef.current = true
    setSkippedDays(0)
    setWeekOffset(0)
    setDateIndex(0)
  }, [service?.id, professionalId])

  useEffect(() => {
    if (!business || !service) return
    let cancelled = false
    if (demo) {
      setSlots(previewSlots(date))
      setSlotsFailed(false)
      setLoadingSlots(false)
      setTime('')
      return () => { cancelled = true }
    }
    setLoadingSlots(true)
    setTime('')
    setSlotsFailed(false)
    getPublicSlots(business.slug, service.id, date, professionalId || null).then(({ slots: found, failed }) => {
      if (cancelled) return
      const day = weekOffset * 5 + dateIndex
      if (found.length === 0 && !failed && autoPickRef.current && day < 14 && day + 1 <= maxDays) {
        setSkippedDays(day + 1)
        setWeekOffset(Math.floor((day + 1) / 5))
        setDateIndex((day + 1) % 5)
        return
      }
      autoPickRef.current = false
      setSlots(found)
      setSlotsFailed(failed)
      setLoadingSlots(false)
    })
    return () => { cancelled = true }
  }, [business, service, professionalId, date, slotsRetry, demo])

  // Después de reservar, vuelve al primer paso del mismo negocio (el nombre y el correo quedan cargados)
  function startOver() {
    setCompleted(false)
    setWipe(null)
    setCancelToken(null)
    setBookedWith(null)
    setTime('')
    setStep(1)
    setSlotsRetry(count => count + 1)
  }

  const startWipe = () => {
    // Origen relativo a la tarjeta del formulario: el centro del botón de confirmar
    const button = confirmRef.current?.getBoundingClientRect()
    const card = cardRef.current?.getBoundingClientRect()
    setWipe({
      x: button && card ? button.left - card.left + button.width / 2 : 200,
      y: button && card ? button.top - card.top + button.height / 2 : 300,
      phase: 'cover',
    })
  }

  // Antes se podía tocar "Confirmar" con los datos vacíos y no pasaba nada visible: ahora cada campo dice qué falta
  function submitReview(event: FormEvent) {
    event.preventDefault()
    const errors: { name?: string; email?: string } = {}
    if (!name.trim()) errors.name = 'Escribí tu nombre y apellido.'
    if (!email.trim()) errors.email = 'Escribí tu correo: ahí te llega la confirmación.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Revisá el correo: tiene que ser como nombre@ejemplo.com.'
    setFieldErrors(errors)
    if (errors.name) { nameRef.current?.focus(); return }
    if (errors.email) { emailRef.current?.focus(); return }
    void save()
  }

  const save = async () => {
    if (!time || !business || !service || !name.trim() || !email.trim()) return
    setSaving(true)
    setError('')
    if (demo) {
      startWipe()
      return
    }
    const { professionalName, cancelToken: token, error: bookError } = await bookPublic({
      slug: business.slug,
      serviceId: service.id,
      startsAt: time,
      name: name.trim(),
      email: email.trim(),
      resourceId: professionalId || null,
    })
    if (bookError) { setSaving(false); setError(bookError); return }
    setBookedWith(professionalName)
    setCancelToken(token)
    startWipe()
  }

  // Link "Agendar" para la pantalla de éxito: abre Google Calendar con el turno.
  // Antes iba en UTC y Google lo mostraba en la zona del calendario de la persona (un turno de las 11:30 aparecía a otra hora):
  // ahora va la hora del negocio con su zona (ctz), así el evento queda a la hora del turno.
  const calendarUrl = useMemo(() => {
    if (!completed || !service || !time || !business) return ''
    const start = new Date(time)
    const end = new Date(start.getTime() + service.duration_min * 60000)
    const stamp = (d: Date) => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(d).map(part => [part.type, part.value]))
      return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`
    }
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Turno: ${service.name} — ${business.name}`,
      dates: `${stamp(start)}/${stamp(end)}`,
      ctz: BUSINESS_TIME_ZONE,
      details: cancelToken
        ? `Reserva confirmada con RESER.\nSi no podés ir, cancelá desde: ${cancelUrl(cancelToken)}`
        : 'Reserva confirmada con RESER.',
    })
    // Con la dirección cargada en Configuración, Google la pone como lugar del evento (y da cómo llegar)
    if (business.address?.trim()) params.set('location', addressForMaps(business.address))
    return `https://calendar.google.com/calendar/render?${params.toString()}`
  }, [completed, service, time, business, cancelToken])

  if (loadingServices) return <section className="booking-shell booking-shell--success">
    <div className="booking-success" role="status"><p className="eyebrow">Cargando…</p></div>
  </section>

  if (loadFailed) return <section className="booking-shell booking-shell--success">
    <div className="booking-success">
      <p className="eyebrow">Reserva online</p><h1>No pudimos cargar la agenda.</h1>
      <p className="success-copy">Parece un problema de conexión. Revisá tu internet y probá de nuevo.</p>
      <button className="button button--secondary" onClick={() => { setLoadFailed(false); setLoadingServices(true); setRetryCount(c => c + 1) }}>Reintentar</button>
    </div>
  </section>

  if (!business) return <section className="booking-shell booking-shell--success">
    <div className="booking-success">
      <p className="eyebrow">Reserva online</p><h1>No encontramos ese negocio.</h1>
      <p className="success-copy">Revisá que el enlace esté bien escrito o pedile al negocio que te lo vuelva a enviar.</p>
      <button className="button button--secondary" onClick={onBack}>Volver a RESER</button>
    </div>
  </section>

  if (completed && service) return <section className="booking-shell booking-shell--success">
    <motion.div className="booking-success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      <SuccessCheck startDelay={0.5} />
      <motion.div variants={successStagger} initial={reduceMotion ? 'show' : 'hidden'} animate="show">
        <motion.p variants={successRise} className="eyebrow eyebrow--ok">{demo ? 'Vista previa' : 'Reserva confirmada'}</motion.p>
        <motion.h1 variants={successRise}>{demo ? `Así se vería tu reserva, ${name.trim().split(' ')[0]}.` : `Todo listo, ${name.trim().split(' ')[0]}.`}</motion.h1>
        <motion.p variants={successRise} className="success-copy">{demo ? 'Este es el último paso de la demostración. No se creó ningún turno real.' : <>Tu turno en {business.name} quedó reservado para el <strong>{fullDayLabel(date)}</strong> a las <strong>{timeLabel(time)}</strong>.</>}</motion.p>
        <motion.div variants={successRise} className="booking-receipt"><span>{service.name}</span><strong>{priceLabel(service.price, service.price_mode)}</strong><span>{service.duration_min} minutos</span>{professionals.length > 1 && bookedWith && <span>Con {bookedWith}</span>}<span>{demo ? 'Solo demostración' : 'Confirmada'}</span></motion.div>
        <motion.div variants={successRise} className="success-notes">
          {demo
            ? <p className="success-note"><CirclePlay size={15} /> <span>No se guardó en la agenda del negocio.</span></p>
            : <p className="success-note"><Mail size={15} /> <span>La reserva quedó asociada a tu correo.</span></p>}
          {!demo && business.address && <p className="success-note"><MapPin size={15} /> <span>Te esperamos en {business.address}.</span></p>}
          {!demo && cancelToken && <p className="success-note"><Mail size={15} /> <span>Si no podés asistir, cancelá desde <a href={cancelUrl(cancelToken)}>este enlace</a>{business.cancel_min_hours > 0 ? ` (hasta ${business.cancel_min_hours} hs antes)` : ''}. Guardalo.</span></p>}
        </motion.div>
        <motion.div variants={successRise} className="success-actions">
          {!demo && <a className="button button--primary" href={calendarUrl} target="_blank" rel="noreferrer">Agendar en Google Calendar <CalendarDays size={17} /></a>}
          {/* La reserva termina en el negocio, no en la portada de RESER: se puede sacar otro turno ahí mismo */}
          {demo
            ? <button className="button button--secondary" onClick={onBack}>Volver a RESER</button>
            : <button className="button button--secondary" onClick={startOver}>Reservar otro turno</button>}
        </motion.div>
      </motion.div>
      {wipe?.phase === 'reveal' && <GreenWipe phase="reveal" onDone={() => setWipe(null)} />}
    </motion.div>
  </section>

  // Desde el plan Básico la página es solo del negocio: sin la marca de RESER arriba ni el "Hecho con RESER" abajo
  const showReser = demo || business.show_badge !== false
  return <section className="booking-shell">
    {showReser && <div className="booking-topbar"><button className="text-button booking-brand" onClick={onBack} aria-label="RESER, ir al inicio">RESER</button>{demo && <span className="booking-demo-badge"><CirclePlay size={14} /> Demostración · no se guarda</span>}</div>}
    <div className="booking-layout">
      {/* La página es del negocio: su logo y su nombre van primero, sin publicidad de RESER entre el cliente y los servicios */}
      <aside className="booking-intro">
        <span className="mini-logo booking-logo" style={logoUrl(business.logo_path) ? { backgroundImage: `url(${logoUrl(business.logo_path)})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{business.name.slice(0, 2).toUpperCase()}</span>
        <div className="booking-identity">
          <h1>{business.name}</h1>
          <p>{demo ? 'Demostración: recorré la reserva como si fueras un cliente. No se crea ningún turno real.' : 'Reservá tu turno online en tres pasos.'}</p>
        </div>
        {(business.address || business.phone) && <div className="booking-contact">{business.address && <a href={mapsUrl(business.address)} target="_blank" rel="noreferrer"><MapPin size={16} /> {business.address}</a>}{business.phone && <a href={telHref(business.phone)}><Phone size={16} /> {business.phone}</a>}</div>}</aside>
      <div className="booking-card" ref={cardRef}>
        <div className="stepper" role="group" aria-label={`Paso ${step} de 3`}>{[1, 2, 3].map((n) =>
          n < step
            ? <button type="button" className="is-active" key={n} onClick={() => setStep(n)} aria-label={`Volver al paso ${n}`}>{n}</button>
            : <span className={n === step ? 'is-active' : ''} key={n} aria-current={n === step ? 'step' : undefined} aria-label={n === step ? `Paso ${n}, actual` : `Paso ${n}, pendiente`}>{n}</span>)}</div>
        <AutoHeight>
        <AnimatePresence mode="wait">
          {step === 1 && <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <h2>Elegí tu servicio</h2>
            <div className="service-list">{services.map(item => <button type="button" aria-pressed={service?.id === item.id} className={`service-option ${service?.id === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setService(item)}><span className="option-text"><strong>{item.name}</strong><small>{item.booking_mode === 'whatsapp' ? 'Se coordina por WhatsApp' : `${item.duration_min} min`}</small></span><b>{priceLabel(item.price, item.price_mode)}</b><span className="option-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></button>)}</div>
            {serviceProfessionals.length > 1 && <><p className="booking-question">¿Con quién querés atenderte?</p>
            <div className="service-list">
              {!isWhatsapp && <button type="button" aria-pressed={professionalId === ''} className={`service-option ${professionalId === '' ? 'is-selected' : ''}`} onClick={() => setProfessionalId('')}><span className="service-icon"><UsersRound size={16} /></span><span className="option-text"><strong>Cualquiera</strong><small>Te asignamos a quien esté libre</small></span><span className="option-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></button>}
              {serviceProfessionals.map(p => <button type="button" key={p.id} aria-pressed={professionalId === p.id} className={`service-option ${professionalId === p.id ? 'is-selected' : ''}`} onClick={() => setProfessionalId(p.id)}><span className="service-icon"><UserRound size={16} /></span><span className="option-text"><strong>{p.name}</strong></span><span className="option-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></button>)}
            </div></>}
            {/* Un solo profesional para este servicio: es un dato, no una opción, así que no se dibuja como una elegida */}
            {professionals.length > 1 && serviceProfessionals.length === 1 && <p className="booking-question booking-assigned"><UserRound size={16} aria-hidden="true" /> Te atiende {serviceProfessionals[0].name}.</p>}
            {service && professionals.length > 0 && serviceProfessionals.length === 0 && <p className="section-description" role="status">Por ahora nadie atiende este servicio. Elegí otro o consultá directamente con el negocio.</p>}
            {isWhatsapp
              ? <>
                <p className="section-description">Este servicio se coordina por WhatsApp: escribile directamente y acuerdan día y horario.</p>
                {waHref
                  ? <a className="button button--primary button--full" href={waHref} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Escribir por WhatsApp</a>
                  : <>
                    <button type="button" className="button button--primary button--full" disabled><MessageCircle size={18} /> Escribir por WhatsApp</button>
                    <p className="section-description" role="status" style={{ marginTop: 10 }}>
                      {waName ? `${waName} todavía no cargó su WhatsApp.` : 'Este servicio todavía no tiene un WhatsApp cargado.'}{' '}
                      {serviceProfessionals.length > 1 ? 'Elegí a otra persona o consultá directamente con el negocio.' : 'Consultá directamente con el negocio.'}
                    </p>
                  </>}
              </>
              : <button className="button button--primary button--full booking-step-cta" disabled={!service || (professionals.length > 0 && serviceProfessionals.length === 0)} onClick={() => setStep(2)}>Continuar <ArrowRight size={17} /></button>}
          </motion.div>}
          {step === 2 && <motion.div key="schedule" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button className="back-button" onClick={() => setStep(1)}><ChevronLeft size={16} /> Volver</button><h2>Elegí día y horario</h2>
            {service && <p className="booking-choice"><span><strong>{service.name}</strong> · {service.duration_min} min{serviceProfessionals.length > 1 ? ` · ${serviceProfessionals.find(p => p.id === professionalId)?.name ? `con ${serviceProfessionals.find(p => p.id === professionalId)?.name}` : 'con quien esté libre'}` : ''}</span><button type="button" className="link-button" onClick={() => setStep(1)}>Cambiar</button></p>}
            <p className="section-description">{skippedDays > 0 ? `${skippedDays === 1 ? 'Hoy ya no quedan turnos' : 'En los próximos días no quedan turnos'}: te mostramos el primer día con horarios libres.` : 'Mostramos solo los turnos que están disponibles.'}</p>
            <div className="date-picker" role="group" aria-label="Día">
              <button type="button" className="nav" aria-label="Días anteriores" disabled={weekOffset === 0} onClick={() => pickDate(Math.max(0, weekOffset - 1), 0)}><ChevronLeft size={15} /></button>
              {dates.map((item, index) => <button type="button" key={item.toDateString()} disabled={weekOffset * 5 + index > maxDays} className={dateIndex === index ? 'is-selected' : ''} aria-pressed={dateIndex === index} aria-label={fullDayLabel(item)} onClick={() => pickDate(weekOffset, index)}><small>{dayLabel(item)}</small><strong>{item.getDate()}</strong></button>)}
              <button type="button" className="nav" aria-label="Días siguientes" disabled={(weekOffset + 1) * 5 > maxDays} onClick={() => pickDate(weekOffset + 1, 0)}><ChevronRight size={15} /></button>
            </div>
            <div className="time-heading"><span><CalendarDays size={16} /> {fullDayLabel(date)}</span><small>Hora local del negocio</small></div>
            {loadingSlots
              ? <div className="time-grid is-loading" role="status" aria-label="Buscando horarios">{Array.from({ length: 8 }, (_, i) => <span key={i} className="slot-skeleton" />)}</div>
              : slotsFailed
                ? <p className="section-description" role="alert">No pudimos cargar los horarios. <button type="button" className="text-button" onClick={() => { setSlotsFailed(false); setLoadingSlots(true); setSlotsRetry(c => c + 1) }}>Reintentar</button></p>
                : slots.length === 0
                ? <p className="section-description">{date.toDateString() === new Date().toDateString() && (business?.min_notice_hours ?? 0) > 0
                  ? `Para hoy ya no quedan turnos disponibles: este negocio pide reservar con al menos ${business!.min_notice_hours} ${business!.min_notice_hours === 1 ? 'hora' : 'horas'} de anticipación. Probá con otro día.`
                  : 'No quedan turnos este día. Probá con otro.'}</p>
                : <div className="time-grid" role="group" aria-label={`Horarios del ${fullDayLabel(date)}`}>{slots.map((iso) => <button type="button" key={iso} className={time === iso ? 'is-selected' : ''} aria-pressed={time === iso} onClick={() => setTime(iso)}>{timeLabel(iso)}</button>)}</div>}
            <button className="button button--primary button--full booking-step-cta" disabled={!time} onClick={() => setStep(3)}>Revisar reserva <ArrowRight size={17} /></button>
          </motion.div>}
          {step === 3 && service && <motion.form key="review" noValidate onSubmit={submitReview} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button type="button" className="back-button" onClick={() => setStep(2)}><ChevronLeft size={16} /> Volver</button><h2>Confirmá tu reserva</h2><p className="section-description">Dejanos tu nombre y revisá los detalles antes de confirmar.</p>
            <div className="field-grid">
              <label className={`field${fieldErrors.name ? ' is-invalid' : ''}`}><span>Nombre completo</span><div><UserRound size={17} /><input ref={nameRef} required autoComplete="name" value={name} onChange={e => { setName(personName(e.target.value)); setFieldErrors(current => ({ ...current, name: undefined })) }} aria-label="Nombre completo" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'booking-name-error' : undefined} /></div>{fieldErrors.name && <small className="field-error" id="booking-name-error">{fieldErrors.name}</small>}</label>
              <label className={`field${fieldErrors.email ? ' is-invalid' : ''}`}><span>Correo electrónico</span><div><Mail size={17} /><input ref={emailRef} required autoComplete="email" value={email} onChange={e => { setEmail(cleanEmail(e.target.value)); setFieldErrors(current => ({ ...current, email: undefined })) }} type="email" aria-label="Correo electrónico (obligatorio)" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'booking-email-error' : undefined} /></div>{fieldErrors.email && <small className="field-error" id="booking-email-error">{fieldErrors.email}</small>}</label>
            </div>
            <div className="review-card"><div><span>Servicio</span><strong>{service.name}</strong></div><div><span>Fecha y hora</span><strong>{fullDayLabel(date)}, {timeLabel(time)}</strong></div><div><span>Duración</span><strong>{service.duration_min} minutos</strong></div>{professionals.length > 1 && serviceProfessionals.length > 0 && <div><span>Profesional</span><strong>{serviceProfessionals.find(p => p.id === professionalId)?.name ?? (serviceProfessionals.length === 1 ? serviceProfessionals[0].name : 'Quien esté libre')}</strong></div>}<div className="review-total"><span>{service.price_mode === 'fixed' ? 'Total' : 'Precio'}</span><strong>{priceLabel(service.price, service.price_mode)}</strong></div></div>
            <button ref={confirmRef} type="submit" className="button button--primary button--full" disabled={saving}>{wipe ? <>¡Reservado! <Check size={18} /></> : saving ? <><span className="writing-loader"><PencilLine size={18} /></span> Guardando tu turno…</> : <>Confirmar reserva <Check size={18} /></>}</button>
            {error
              ? <p className="form-error" role="alert">{error}</p>
              : <p className="form-note">Al correo te llega la confirmación y el enlace para cancelar.{business.cancel_min_hours > 0 ? ` Podés cancelar hasta ${business.cancel_min_hours} hs antes del turno.` : ' Podés cancelar cuando quieras.'}</p>}
          <p className="form-note">Al confirmar aceptás que {business.name} y RESER usen tus datos para gestionar este turno y avisarte por email. <a href="/privacidad" target="_blank" rel="noreferrer">Política de privacidad</a>.</p>
          </motion.form>}
        </AnimatePresence>
        </AutoHeight>
        {/* Plan Gratis: la marca va al pie de la tarjeta, después de todo lo que el cliente tiene que hacer */}
        {showReser && !demo && <p className="booking-made-with">Hecho con <a href="/">RESER</a>: armá tu página de reservas gratis</p>}
        {wipe?.phase === 'cover' && <GreenWipe phase="cover" x={wipe.x} y={wipe.y} onDone={() => { setCompleted(true); setSaving(false); setWipe(w => w && { ...w, phase: 'reveal' }) }} />}
      </div>
    </div>
  </section>
}
