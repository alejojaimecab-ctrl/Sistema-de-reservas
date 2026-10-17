import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Brush, CalendarDays, MapPin, MessageCircle, Phone, Check, ChevronLeft, ChevronRight, CirclePlay, Clock3, Mail, PencilLine, Scissors, Sparkles, UserRound } from 'lucide-react'
import { demoServices, priceLabel } from '../data/demo'
import { bookPublic, getPublicBusiness, getPublicSlots, listPublicProfessionals, listPublicResourceServices, listPublicServices, type PublicBusiness, type PublicProfessional, type PublicService, type ResourceService } from '../lib/db'
import { logoUrl } from '../lib/db'
import { SuccessCheck } from './SuccessCheck'
import { cancelUrl, mapsUrl, telHref, whatsappHref } from '../lib/routes'

const serviceIcons = [Scissors, Brush, Sparkles]

const dayLabel = (d: Date) =>
  d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase())
const fullDayLabel = (d: Date) =>
  d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// Entrada escalonada de la pantalla de reserva confirmada (arranca cuando termina el tilde)
const successStagger = { hidden: {}, show: { transition: { delayChildren: 0.7, staggerChildren: 0.09 } } }
const successRise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

const demoBusiness: PublicBusiness = { slug: 'demo', name: 'Tu Negocio', cancel_min_hours: 2, min_notice_hours: 1, max_advance_days: 60, phone: null, address: null, logo_path: null }
const demoProfessionals: PublicProfessional[] = [{ id: 'demo-1', name: 'Martín', whatsapp: null }, { id: 'demo-2', name: 'Sofía', whatsapp: null }]
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
  const [dateIndex, setDateIndex] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
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
  const reduceMotion = useReducedMotion()

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
        setService(previewServices[0] ?? null)
        setLoadingServices(false)
        return
      }
      if (!slug) { setLoadingServices(false); return }
      const { business: biz, failed } = await getPublicBusiness(slug)
      if (cancelled) return
      if (failed) { setLoadFailed(true); setLoadingServices(false); return }
      setBusiness(biz)
      if (biz) {
        const { services: svcs, failed: servicesFailed } = await listPublicServices(biz.slug)
        if (cancelled) return
        if (servicesFailed) { setLoadFailed(true); setLoadingServices(false); return }
        const [{ professionals: team }, teamOffers] = await Promise.all([
          listPublicProfessionals(biz.slug),
          listPublicResourceServices(biz.slug),
        ])
        if (cancelled) return
        setOffers(teamOffers)
        setServices(svcs)
        setService(svcs[0] ?? null)
        setProfessionals(team)
      }
      setLoadingServices(false)
    })()
    return () => { cancelled = true }
  }, [demo, slug, retryCount])

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
      setSlots(found)
      setSlotsFailed(failed)
      setLoadingSlots(false)
    })
    return () => { cancelled = true }
  }, [business, service, professionalId, date, slotsRetry, demo])

  const save = async () => {
    if (!time || !business || !service || !name.trim() || !email.trim()) return
    setSaving(true)
    setError('')
    if (demo) {
      setSaving(false)
      setCompleted(true)
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
    setSaving(false)
    if (bookError) { setError(bookError); return }
    setBookedWith(professionalName)
    setCancelToken(token)
    setCompleted(true)
  }

  // Link "Agendar" para la pantalla de éxito: abre Google Calendar con el turno
  const calendarUrl = useMemo(() => {
    if (!completed || !service || !time || !business) return ''
    const start = new Date(time)
    const end = new Date(start.getTime() + service.duration_min * 60000)
    const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '')
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Turno: ${service.name} — ${business.name}`,
      dates: `${stamp(start)}/${stamp(end)}`,
      details: 'Reserva confirmada con RESER.',
    })
    return `https://calendar.google.com/calendar/render?${params.toString()}`
  }, [completed, service, time, business])

  if (loadingServices) return <section className="booking-shell booking-shell--success">
    <div className="booking-success"><p className="eyebrow">Cargando…</p></div>
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
    <motion.div className="booking-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 190, damping: 20 }}>
      <SuccessCheck />
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
          <button className="button button--secondary" onClick={onBack}>Volver a RESER</button>
        </motion.div>
      </motion.div>
    </motion.div>
  </section>

  return <section className="booking-shell">
    <div className="booking-topbar"><button className="text-button" onClick={onBack}><ChevronLeft size={17} /> RESER</button>{demo ? <span className="booking-demo-badge"><CirclePlay size={14} /> Demostración · no se guarda</span> : <span className="booking-business">{business.name}</span>}</div>
    <div className="booking-layout">
      <aside className="booking-intro"><span className="mini-logo" style={logoUrl(business.logo_path) ? { backgroundImage: `url(${logoUrl(business.logo_path)})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{business.name.slice(0, 2).toUpperCase()}</span><p className="eyebrow">{demo ? 'Demostración interactiva' : 'Reserva online'}</p><h1>Un momento para vos.</h1><p>{demo ? 'Recorré el flujo como si fueras a reservar. No se crea ningún turno real.' : 'Elegí tu servicio y encontrá el mejor horario. Tu turno se confirma al instante.'}</p><div className="booking-side-info"><Clock3 size={17} /><span>{demo ? 'Probá los pasos sin guardar datos.' : 'Sin esperas. Sin llamadas.'}</span></div>{(business.address || business.phone) && <div className="booking-contact">{business.address && <a href={mapsUrl(business.address)} target="_blank" rel="noreferrer"><MapPin size={16} /> {business.address}</a>}{business.phone && <a href={telHref(business.phone)}><Phone size={16} /> {business.phone}</a>}</div>}</aside>
      <div className="booking-card">
        <div className="stepper" aria-label={`Paso ${step} de 3`}>{[1, 2, 3].map((n) =>
          n < step
            ? <button type="button" className="is-active" key={n} onClick={() => setStep(n)} aria-label={`Volver al paso ${n}`}>{n}</button>
            : <span className={n === step ? 'is-active' : ''} key={n}>{n}</span>)}</div>
        <AnimatePresence mode="wait">
          {step === 1 && <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="eyebrow">Paso 01</p><h2>Elegí tu servicio</h2><p className="section-description">El precio y la duración son claros desde el inicio.</p>
            <div className="service-list">{services.map((item, i) => { const Icon = serviceIcons[i % serviceIcons.length]; return <button type="button" className={`service-option ${service?.id === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setService(item)}><span className="service-icon"><Icon size={19} /></span><span><strong>{item.name}</strong><small>{item.booking_mode === 'whatsapp' ? 'Se coordina por WhatsApp' : `${item.duration_min} min`}</small></span><b>{priceLabel(item.price, item.price_mode)}</b></button> })}</div>
            {serviceProfessionals.length > 1 && <><p className="section-description">¿Con quién querés atenderte?</p>
            <div className="service-list">
              {!isWhatsapp && <button type="button" className={`service-option ${professionalId === '' ? 'is-selected' : ''}`} onClick={() => setProfessionalId('')}><span className="service-icon"><UserRound size={19} /></span><span><strong>Cualquiera</strong><small>Te asignamos a quien esté libre</small></span></button>}
              {serviceProfessionals.map(p => <button type="button" key={p.id} className={`service-option ${professionalId === p.id ? 'is-selected' : ''}`} onClick={() => setProfessionalId(p.id)}><span className="service-icon"><UserRound size={19} /></span><span><strong>{p.name}</strong></span></button>)}
            </div></>}
            {professionals.length > 1 && serviceProfessionals.length === 1 && <div className="service-option is-selected" style={{ cursor: 'default', margin: '16px 0 18px' }}><span className="service-icon"><UserRound size={19} /></span><span><strong>{serviceProfessionals[0].name}</strong><small>Te atiende</small></span></div>}
            {professionals.length > 0 && serviceProfessionals.length === 0 && <p className="section-description" role="status">Por ahora nadie atiende este servicio. Elegí otro o consultá directamente con el negocio.</p>}
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
              : <button className="button button--primary button--full" disabled={!service || (professionals.length > 0 && serviceProfessionals.length === 0)} onClick={() => setStep(2)}>Continuar <ChevronRight size={18} /></button>}
          </motion.div>}
          {step === 2 && <motion.div key="schedule" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button className="back-button" onClick={() => setStep(1)}><ChevronLeft size={16} /> Volver</button><p className="eyebrow">Paso 02</p><h2>Elegí día y horario</h2><p className="section-description">Mostramos solo los turnos que están disponibles.</p>
            <div className="date-picker">
              <button type="button" className="nav" aria-label="Días anteriores" disabled={weekOffset === 0} onClick={() => { setWeekOffset(w => Math.max(0, w - 1)); setDateIndex(0) }}><ChevronLeft size={15} /></button>
              {dates.map((item, index) => <button type="button" key={item.toDateString()} disabled={weekOffset * 5 + index > maxDays} className={dateIndex === index ? 'is-selected' : ''} onClick={() => setDateIndex(index)}><small>{dayLabel(item)}</small><strong>{item.getDate()}</strong></button>)}
              <button type="button" className="nav" aria-label="Días siguientes" disabled={(weekOffset + 1) * 5 > maxDays} onClick={() => { setWeekOffset(w => w + 1); setDateIndex(0) }}><ChevronRight size={15} /></button>
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
                : <div className="time-grid">{slots.map((iso) => <button key={iso} className={time === iso ? 'is-selected' : ''} onClick={() => setTime(iso)}>{timeLabel(iso)}</button>)}</div>}
            <button className="button button--primary button--full" disabled={!time} onClick={() => setStep(3)}>Revisar reserva <ChevronRight size={18} /></button>
          </motion.div>}
          {step === 3 && service && <motion.form key="review" onSubmit={event => { event.preventDefault(); void save() }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button type="button" className="back-button" onClick={() => setStep(2)}><ChevronLeft size={16} /> Volver</button><p className="eyebrow">Paso 03</p><h2>Confirmá tu reserva</h2><p className="section-description">Dejanos tu nombre y revisá los detalles antes de confirmar.</p>
            <div className="field-grid"><label className="field"><span>Nombre completo</span><div><UserRound size={17} /><input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} aria-label="Nombre completo" /></div></label><label className="field"><span>Correo electrónico <small>(obligatorio)</small></span><div><Mail size={17} /><input required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} type="email" aria-label="Correo electrónico (obligatorio)" /></div></label></div>
            <div className="review-card"><div><span>Servicio</span><strong>{service.name}</strong></div><div><span>Fecha y hora</span><strong>{fullDayLabel(date)}, {timeLabel(time)}</strong></div><div><span>Duración</span><strong>{service.duration_min} minutos</strong></div>{professionals.length > 1 && serviceProfessionals.length > 0 && <div><span>Profesional</span><strong>{serviceProfessionals.find(p => p.id === professionalId)?.name ?? (serviceProfessionals.length === 1 ? serviceProfessionals[0].name : 'Quien esté libre')}</strong></div>}<div className="review-total"><span>{service.price_mode === 'fixed' ? 'Total' : 'Precio'}</span><strong>{priceLabel(service.price, service.price_mode)}</strong></div></div>
            <button type="submit" className="button button--primary button--full" disabled={saving}>{saving ? <><span className="writing-loader"><PencilLine size={18} /></span> Guardando tu turno…</> : <>Confirmar reserva <Check size={18} /></>}</button>
            {error
              ? <p className="form-note" role="alert">{error}</p>
              : <p className="form-note">Lo usamos para identificar tu reserva.{business.cancel_min_hours > 0 ? ` Podés cancelar hasta ${business.cancel_min_hours} hs antes del turno.` : ' Podés cancelar cuando quieras.'}</p>}
          <p className="form-note">Al confirmar aceptás que {business.name} y RESER usen tus datos para gestionar este turno y avisarte por email. <a href="/privacidad" target="_blank" rel="noreferrer">Política de privacidad</a>.</p>
          </motion.form>}
        </AnimatePresence>
      </div>
    </div>
  </section>
}
