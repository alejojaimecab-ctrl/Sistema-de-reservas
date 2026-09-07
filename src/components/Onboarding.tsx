import { useState } from 'react'
import { ArrowRight, Check, Clock3, Mail, Store, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import { demoServices, formatPrice } from '../data/demo'

export function Onboarding({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const [step, setStep] = useState(1)
  return <main className="onboarding"><header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header><div className="onboarding-progress"><span style={{ width: `${step * 25}%` }} /></div>
    <section className="onboarding-card"><p className="eyebrow">Configuración inicial · {step}/4</p>
      {step === 1 && <><span className="onboarding-icon"><Store size={25} /></span><h1>Empecemos por tu negocio.</h1><p>Este nombre va a aparecer en tu página de reservas.</p><label className="onboarding-field">Nombre del negocio<input defaultValue="Original Style" /></label><label className="onboarding-field">Tu enlace de RESER<div className="url-field"><span>reser.com.ar/</span><input defaultValue="original-style" /></div></label></>}
      {step === 2 && <><span className="onboarding-icon"><Sparkles size={25} /></span><h1>¿Qué servicios ofrecés?</h1><p>Podrás editarlos o sumar más después.</p><div className="setup-services">{demoServices.map((service) => <div key={service.id}><span><Check size={15} /></span><p><strong>{service.name}</strong><small>{service.duration} minutos</small></p><b>{formatPrice(service.price)}</b></div>)}</div></>}
      {step === 3 && <><span className="onboarding-icon"><Clock3 size={25} /></span><h1>Definí tu disponibilidad.</h1><p>Los clientes solo verán los horarios que vos habilites.</p><div className="availability-preview"><span>Lunes a viernes</span><strong>09:00 — 18:00</strong><span>Sábados</span><strong>09:00 — 13:00</strong></div></>}
      {step === 4 && <><span className="onboarding-icon"><Mail size={25} /></span><h1>Tu agenda está lista.</h1><p>Vas a recibir cada nueva reserva y el sistema le enviará una confirmación al cliente.</p><div className="ready-card"><Check size={20} /><span><strong>Notificaciones por email</strong><small>Podrás conectar WhatsApp Business cuando quieras.</small></span></div></>}
      <button className="button button--primary button--full" onClick={() => step === 4 ? onFinish() : setStep(step + 1)}>{step === 4 ? 'Ir a mi panel' : 'Continuar'} <ArrowRight size={18} /></button>
    </section>
  </main>
}
