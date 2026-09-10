import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Mail, PencilLine, UserRound } from 'lucide-react'
import { demoServices, formatPrice, type Service } from '../data/demo'

const dates = [
  { day: 'Lun', date: '14', label: 'Lunes 14' },
  { day: 'Mar', date: '15', label: 'Martes 15' },
  { day: 'Mié', date: '16', label: 'Miércoles 16' },
  { day: 'Jue', date: '17', label: 'Jueves 17' },
  { day: 'Vie', date: '18', label: 'Viernes 18' },
]
const times = ['09:30', '10:00', '10:30', '11:30', '14:00', '15:30', '16:00', '17:30']

export function BookingExperience({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(1)
  const [service, setService] = useState<Service>(demoServices[0])
  const [dateIndex, setDateIndex] = useState(0)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const date = useMemo(() => dates[dateIndex], [dateIndex])

  const save = () => {
    if (!time) return
    setSaving(true)
    window.setTimeout(() => { setSaving(false); setCompleted(true) }, 1650)
  }

  if (completed) return <section className="booking-shell booking-shell--success">
    <motion.div className="booking-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 190, damping: 20 }}>
      <motion.div className="success-orbit" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}><span /></motion.div>
      <span className="success-icon"><Check size={34} strokeWidth={2.5} /></span>
      <p className="eyebrow">Reserva confirmada</p><h1>Todo listo, Lucía.</h1>
      <p className="success-copy">Tu turno en Tu Negocio quedó reservado para el <strong>{date.label}</strong> a las <strong>{time}</strong>.</p>
      <div className="booking-receipt"><span>{service.name}</span><strong>{formatPrice(service.price)}</strong><span>{service.duration} minutos</span><span>Confirmada</span></div>
      <p className="success-note"><Mail size={15} /> Te enviamos la confirmación a tu correo.</p>
      <button className="button button--secondary" onClick={onBack}>Volver a RESER</button>
    </motion.div>
  </section>

  return <section className="booking-shell">
    <div className="booking-topbar"><button className="text-button" onClick={onBack}><ChevronLeft size={17} /> RESER</button><span className="booking-business">Tu Negocio <i /> Córdoba</span></div>
    <div className="booking-layout">
      <aside className="booking-intro"><span className="mini-logo">TN</span><p className="eyebrow">Reserva online</p><h1>Un momento para vos.</h1><p>Elegí tu servicio y encontrá el mejor horario. Tu turno se confirma al instante.</p><div className="booking-side-info"><Clock3 size={17} /><span>Sin esperas. Sin llamadas.</span></div></aside>
      <div className="booking-card">
        <div className="stepper" aria-label={`Paso ${step} de 3`}>{[1, 2, 3].map((n) => <span className={n <= step ? 'is-active' : ''} key={n}>{n}</span>)}</div>
        <AnimatePresence mode="wait">
          {step === 1 && <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="eyebrow">Paso 01</p><h2>Elegí tu servicio</h2><p className="section-description">El precio y la duración son claros desde el inicio.</p>
            <div className="service-list">{demoServices.map((item) => { const Icon = item.icon; return <button type="button" className={`service-option ${service.id === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setService(item)}><span className="service-icon"><Icon size={19} /></span><span><strong>{item.name}</strong><small>{item.duration} min</small></span><b>{formatPrice(item.price)}</b></button> })}</div>
            <div className="field-grid"><label className="field"><span>Nombre completo</span><div><UserRound size={17} /><input defaultValue="Lucía Fernández" aria-label="Nombre completo" /></div></label><label className="field"><span>Correo electrónico</span><div><Mail size={17} /><input defaultValue="lucia@email.com" type="email" aria-label="Correo electrónico" /></div></label></div>
            <button className="button button--primary button--full" onClick={() => setStep(2)}>Continuar <ChevronRight size={18} /></button>
          </motion.div>}
          {step === 2 && <motion.div key="schedule" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button className="back-button" onClick={() => setStep(1)}><ChevronLeft size={16} /> Volver</button><p className="eyebrow">Paso 02</p><h2>Elegí día y horario</h2><p className="section-description">Mostramos solo los turnos que están disponibles.</p>
            <div className="date-picker"><button aria-label="Semana anterior"><ChevronLeft size={17} /></button>{dates.map((item, index) => <button key={item.date} className={dateIndex === index ? 'is-selected' : ''} onClick={() => setDateIndex(index)}><small>{item.day}</small><strong>{item.date}</strong></button>)}<button aria-label="Semana siguiente"><ChevronRight size={17} /></button></div>
            <div className="time-heading"><span><CalendarDays size={16} /> {date.label}</span><small>GMT-3</small></div><div className="time-grid">{times.map((item) => <button key={item} className={time === item ? 'is-selected' : ''} onClick={() => setTime(item)}>{item}</button>)}</div>
            <button className="button button--primary button--full" disabled={!time} onClick={() => setStep(3)}>Revisar reserva <ChevronRight size={18} /></button>
          </motion.div>}
          {step === 3 && <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <button className="back-button" onClick={() => setStep(2)}><ChevronLeft size={16} /> Volver</button><p className="eyebrow">Paso 03</p><h2>Confirmá tu reserva</h2><p className="section-description">Revisá los detalles antes de confirmar.</p>
            <div className="review-card"><div><span>Servicio</span><strong>{service.name}</strong></div><div><span>Fecha y hora</span><strong>{date.label}, {time}</strong></div><div><span>Duración</span><strong>{service.duration} minutos</strong></div><div className="review-total"><span>Total</span><strong>{formatPrice(service.price)}</strong></div></div>
            <button className="button button--primary button--full" onClick={save} disabled={saving}>{saving ? <><span className="writing-loader"><PencilLine size={18} /></span> Guardando tu turno…</> : <>Confirmar reserva <Check size={18} /></>}</button><p className="form-note">Al confirmar, vas a recibir un correo con todos los detalles.</p>
          </motion.div>}
        </AnimatePresence>
      </div>
    </div>
  </section>
}
