import { useState } from 'react'
import { ArrowRight, Check, Clock3, Mail, Store, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { createBusinessWithSetup } from '../lib/db'

export function Onboarding({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const { signUp, session } = useAuth()
  const [step, setStep] = useState(1)
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
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

  async function finish() {
    setError(null)
    if (!ownerName.trim() || !businessName.trim() || !slug.trim()) {
      setError('Completá tu nombre, el nombre del negocio y el enlace (paso 1).')
      return
    }
    if (!email.trim() || password.length < 6) {
      setError('Ingresá un email válido y una contraseña de al menos 6 caracteres.')
      return
    }
    setBusy(true)
    const signUpError = await signUp(email.trim(), password, ownerName.trim())
    if (signUpError) {
      setBusy(false)
      setError(signUpError.includes('already registered') ? 'Ese email ya tiene una cuenta. Iniciá sesión.' : signUpError)
      return
    }
    // signUp inicia sesión automáticamente si la confirmación por email está desactivada;
    // si está activada, mostramos la pantalla de "revisá tu correo" y al confirmar
    // el email Supabase redirige a la app y la sesión se inicia sola.
    const userId = session?.user.id ?? (await supabase.auth.getSession()).data.session?.user.id
    if (!userId) {
      // Sin sesión (confirmación de email activada): guardamos lo cargado para
      // crearlo todo automáticamente cuando el usuario vuelva con la cuenta confirmada.
      try {
        localStorage.setItem('reser-pending-setup', JSON.stringify({
          name: businessName.trim(),
          slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
          services,
          availability,
        }))
      } catch { /* si falla el storage, el usuario lo carga de nuevo en el panel */ }
      setBusy(false)
      setAwaitingConfirmation(true)
      return
    }
    const setupError = await createBusinessWithSetup(userId, {
      name: businessName.trim(),
      slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
      services,
      availability,
    })
    setBusy(false)
    if (setupError) {
      setError(setupError.includes('duplicate') ? 'Ese enlace ya está en uso. Elegí otro.' : setupError)
      return
    }
    try { localStorage.removeItem('reser-pending-setup') } catch { /* noop */ }
    onFinish()
  }

  if (awaitingConfirmation) {
    return <main className="onboarding"><header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header>
      <section className="onboarding-card">
        <span className="onboarding-icon"><Mail size={25} /></span>
        <h1>Revisá tu correo.</h1>
        <p>Te enviamos un email a <strong>{email}</strong> con un enlace para confirmar tu cuenta. Al hacer clic, vas a entrar directamente a tu panel, sin tener que iniciar sesión.</p>
        <p style={{ color: '#7a919c', fontSize: 13 }}>¿No llegó? Revisá la carpeta de spam o correo no deseado.</p>
      </section>
    </main>
  }

  return <main className="onboarding"><header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header><div className="onboarding-progress"><span style={{ width: (step * 25) + '%' }} /></div>
    <section className="onboarding-card"><p className="eyebrow">Configuración inicial · {step}/4</p>
      {step === 1 && (<>
        <span className="onboarding-icon"><Store size={25} /></span>
        <h1>Empecemos por tu negocio.</h1>
        <p>Este nombre va a aparecer en tu página de reservas.</p>
        <label className="onboarding-field">Tu nombre
          <input
            placeholder="Ej: Nicolás"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
          />
        </label>
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
        <label className="onboarding-field">Email de tu cuenta
          <input type="email" placeholder="tu@email.com" value={email}
            onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="onboarding-field">Contraseña
          <input type="password" placeholder="Mínimo 6 caracteres" value={password}
            onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
      </>)}
      <button className="button button--primary button--full" disabled={busy} onClick={() => {
        if (step < 4) { setStep(step + 1); return }
        void finish()
      }}>
        {busy ? 'Creando tu cuenta…' : step === 4 ? 'Ir a mi panel' : 'Continuar'} <ArrowRight size={18} />
      </button>
    </section>
  </main>
}
