import { useState } from 'react'
import { ArrowRight, Check, Clock3, Mail, Store, Sparkles } from 'lucide-react'
import { Brand } from './Brand'

export function Onboarding({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const [step, setStep] = useState(1)
  const [businessName, setBusinessName] = useState('')
  const [slug, setSlug] = useState('')
  const [services, setServices] = useState<Array<{name: string; duration: number; price: number}>>([])
  const [availability, setAvailability] = useState<Record<string, boolean[]>>({
    lunes: Array(24).fill(false),
    martes: Array(24).fill(false),
    miercoles: Array(24).fill(false),
    jueves: Array(24).fill(false),
    viernes: Array(24).fill(false),
    sabado: Array(24).fill(false),
    domingo: Array(24).fill(false)
  })
  const days = [
    {id: 'lunes', name: 'Lunes'},
    {id: 'martes', name: 'Martes'},
    {id: 'miercoles', name: 'Miércoles'},
    {id: 'jueves', name: 'Jueves'},
    {id: 'viernes', name: 'Viernes'},
    {id: 'sabado', name: 'Sábado'},
    {id: 'domingo', name: 'Domingo'}
  ]
  const hours = Array.from({length: 24}, (_, i) => i)
  return <main className="onboarding"><header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header><div className="onboarding-progress"><span style={{ width: (step * 25) + '%' }} /></div>
    <section className="onboarding-card"><p className="eyebrow">Configuración inicial · {step}/4</p>
      {step === 1 && (<>
        <span className="onboarding-icon"><Store size={25} /></span>
        <h1>Empecemos por tu negocio.</h1>
        <p>Este nombre va a aparecer en tu página de reservas.</p>
        <label className="onboarding-field">Nombre del negocio
          <input
            placeholder="Ej: Peluquería López"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
          />
        </label>
        <label className="onboarding-field">Tu enlace de RESER
          <div className="url-field">
            <span>reser.com.ar/</span>
            <input
              placeholder="tu-negocio"
              value={slug}
              onChange={e => setSlug(e.target.value)}
            />
          </div>
        </label>
      </>)}
      {step === 2 && (<>
        <span className="onboarding-icon"><Sparkles size={25} /></span>
        <h1>¿Qué servicios ofrecés?</h1>
        <p>Podrás editarlos o sumar más después.</p>
        <div className="setup-services">
          {services.map((svc, idx) => (
            <div key={idx} className="service-row">
              <input
                placeholder="Nombre del servicio"
                value={svc.name}
                onChange={e => {
                  const copy = [...services]
                  copy[idx].name = e.target.value
                  setServices(copy)
                }}
              />
              <input
                type="number"
                placeholder="Duración (min)"
                min={5}
                step={5}
                value={svc.duration}
                onChange={e => {
                  const copy = [...services]
                  copy[idx].duration = parseInt(e.target.value) || 0
                  setServices(copy)
                }}
              />
              <input
                type="number"
                placeholder="Precio"
                min={0}
                step={100}
                value={svc.price}
                onChange={e => {
                  const copy = [...services]
                  copy[idx].price = parseInt(e.target.value) || 0
                  setServices(copy)
                }}
              />
              <button onClick={() => {
                const copy = [...services]
                copy.splice(idx, 1)
                setServices(copy)
              }} className="service-remove">Eliminar</button>
            </div>
          ))}
          <div className="add-service">
            <button onClick={() => setServices([...services, {name: '', duration: 0, price: 0}])}>+ Agregar otro servicio</button>
          </div>
        </div>
      </>)}
      {step === 3 && (<>
        <span className="onboarding-icon"><Clock3 size={25} /></span>
        <h1>Definí tu disponibilidad.</h1>
        <p>Los clientes solo verán los horarios que vos habilites.</p>
        <div className="availability-table">
          <table>
            <thead>
              <tr>
                <th></th>
                {hours.map(h => (
                  <th key={h}>{h.toString().padStart(2, '0')}:00</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day.id}>
                  <th>{day.name}</th>
                  {hours.map((hourIndex) => (
                    <td key={hourIndex}>
                      <input
                        type="checkbox"
                        checked={availability[day.id][hourIndex]}
                        onChange={(e) => {
                          setAvailability(prev => {
                            const newAvailability = {...prev}
                            const dayArray = [...newAvailability[day.id]]
                            dayArray[hourIndex] = e.target.checked
                            newAvailability[day.id] = dayArray
                            return newAvailability
                          })
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
      {step === 4 && (<>
        <span className="onboarding-icon"><Mail size={25} /></span>
        <h1>Tu agenda está lista.</h1>
        <p>Vas a recibir cada nueva reserva y el sistema le enviará una confirmación al cliente.</p>
        <div className="ready-card">
          <Check size={20} />
          <span><strong>Notificaciones por email</strong><small>Podrás conectar WhatsApp Business cuando quieras.</small></span>
        </div>
      </>)}
      <button className="button button--primary button--full" onClick={() => step === 4 ? onFinish() : setStep(step + 1)}>
        {step === 4 ? 'Ir a mi panel' : 'Continuar'} <ArrowRight size={18} />
      </button>
    </section>
  </main>
}
