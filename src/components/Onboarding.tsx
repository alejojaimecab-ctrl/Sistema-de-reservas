import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Clock3, Mail, Store, Trash2, Sparkles, UsersRound } from 'lucide-react'
import { AvailabilityEditor, type AvailabilityDay, type AvailabilityMap } from './AvailabilityEditor'
import { Brand } from './Brand'
import { PasswordInput } from './PasswordInput'
import { AuthShell } from './AuthShell'
import { EmailCode } from './EmailCode'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'
import { friendlyError, SLUG_TAKEN } from '../lib/errorMessages'
import { createBusinessWithSetup } from '../lib/db'
import { slugify } from '../lib/routes'
import * as field from '../lib/fieldRules'

type SetupService = { name: string; duration: number; price: number }
type OnboardingDraft = {
  step: number
  ownerName: string
  businessName: string
  slug: string
  email: string
  services: SetupService[]
  availability: AvailabilityMap
}

const draftKey = 'reser-onboarding-draft'
const days: AvailabilityDay[] = [
  { id: 'lunes', name: 'Lunes' },
  { id: 'martes', name: 'Martes' },
  { id: 'miercoles', name: 'Miércoles' },
  { id: 'jueves', name: 'Jueves' },
  { id: 'viernes', name: 'Viernes' },
  { id: 'sabado', name: 'Sábado' },
  { id: 'domingo', name: 'Domingo' },
]

function emptyAvailability(): AvailabilityMap {
  return Object.fromEntries(days.map(day => [day.id, Array.from({ length: 48 }, () => false)]))
}

function isAvailabilityMap(value: unknown): value is AvailabilityMap {
  if (!value || typeof value !== 'object') return false
  return days.every(day => {
    const hours = (value as Record<string, unknown>)[day.id]
    return Array.isArray(hours)
      && (hours.length === 24 || hours.length === 48)
      && hours.every(hour => typeof hour === 'boolean')
  })
}

function isSetupService(value: unknown): value is SetupService {
  if (!value || typeof value !== 'object') return false
  const service = value as Record<string, unknown>
  return typeof service.name === 'string'
    && typeof service.duration === 'number'
    && typeof service.price === 'number'
}

function readOnboardingDraft(): { draft: OnboardingDraft | null; error: string | null } {
  try {
    const raw = localStorage.getItem(draftKey)
    if (!raw) return { draft: null, error: null }

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { draft: null, error: 'El borrador guardado no tiene un formato válido.' }
    }
    const value = parsed as Record<string, unknown>
    if (
      typeof value.step !== 'number'
      || !Number.isInteger(value.step)
      || value.step < 1
      || value.step > 4
      || typeof value.ownerName !== 'string'
      || typeof value.businessName !== 'string'
      || typeof value.slug !== 'string'
      || typeof value.email !== 'string'
      || !Array.isArray(value.services)
      || !value.services.every(isSetupService)
      || !isAvailabilityMap(value.availability)
    ) {
      return { draft: null, error: 'El borrador guardado está incompleto o dañado.' }
    }

    const storedAvailability = value.availability as AvailabilityMap
    const availability = Object.fromEntries(days.map(day => {
      const daySlots = storedAvailability[day.id]
      return [day.id, daySlots.length === 24 ? daySlots.flatMap(open => [open, open]) : daySlots]
    }))

    return {
      draft: { ...value, availability } as unknown as OnboardingDraft,
      error: null,
    }
  } catch (error) {
    console.warn('No se pudo recuperar el borrador de onboarding:', error)
    return {
      draft: null,
      error: error instanceof SyntaxError
        ? 'El borrador guardado no tiene un formato válido.'
        : 'No se pudo acceder al borrador guardado en este dispositivo.',
    }
  }
}

function availabilityIsSet(availability: AvailabilityMap) {
  return Object.values(availability).some(hours => hours.some(Boolean))
}

function removeLocalDraft() {
  try {
    localStorage.removeItem(draftKey)
    return null
  } catch (error) {
    return error instanceof Error ? friendlyError(error.message) : 'No se pudo borrar el borrador local.'
  }
}

export function Onboarding({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const { signUp, session, role, business: staffBusiness } = useAuth()
  const [draftRead, setDraftRead] = useState(readOnboardingDraft)
  const restored = draftRead.draft
  const [step, setStep] = useState(restored?.step ?? 1)
  const [ownerName, setOwnerName] = useState(restored?.ownerName ?? '')
  const [email, setEmail] = useState(restored?.email ?? '')
  const [password, setPassword] = useState('')
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [createdUserId, setCreatedUserId] = useState<string | null>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousStepRef = useRef(step)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [businessName, setBusinessName] = useState(restored?.businessName ?? '')
  const [slug, setSlug] = useState(restored?.slug ?? '')
  const [services, setServices] = useState<SetupService[]>(
    restored?.services ?? [{ name: '', duration: 30, price: 0 }],
  )
  const [availability, setAvailability] = useState<AvailabilityMap>(
    restored?.availability ?? emptyAvailability(),
  )

  useEffect(() => {
    if (previousStepRef.current === step) return
    stepHeadingRef.current?.focus()
    previousStepRef.current = step
  }, [step])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (draftRead.error) return

    const hasProgress = step > 1
      || ownerName.trim() !== ''
      || businessName.trim() !== ''
      || slug.trim() !== ''
      || email.trim() !== ''
      || services.some(service => service.name.trim() !== '')
      || availabilityIsSet(availability)

    if (!hasProgress) return

    setDraftStatus('Guardando avance…')
    const timeout = window.setTimeout(() => {
      try {
        const draft: OnboardingDraft = {
          step,
          ownerName,
          businessName,
          slug,
          email,
          services,
          availability,
        }
        localStorage.setItem(draftKey, JSON.stringify(draft))
        setDraftStatus('Avance guardado en este dispositivo.')
      } catch (saveError) {
        const detail = saveError instanceof Error ? friendlyError(saveError.message) : 'No se pudo guardar el avance.'
        setDraftStatus(`No pudimos guardar el avance: ${detail}`)
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [availability, businessName, draftRead.error, email, ownerName, services, slug, step])

  function validateStep(targetStep: number) {
    if (targetStep === 1 && (!ownerName.trim() || !businessName.trim() || !slug.trim())) {
      return 'Completá tu nombre, el nombre del negocio y el enlace para continuar.'
    }
    if (targetStep === 2) {
      const namedServices = services.filter(service => service.name.trim() !== '')
      if (namedServices.length === 0) return 'Agregá al menos un servicio para que tus clientes puedan reservar.'
      if (namedServices.length !== services.length) return 'Completá o eliminá los servicios que quedaron sin nombre.'
      if (namedServices.some(service =>
        !Number.isFinite(service.duration)
        || !Number.isInteger(service.duration)
        || service.duration < 5
        || service.duration % 5 !== 0
        || !Number.isFinite(service.price)
        || service.price < 0
      )) {
        return 'La duración debe ser de 5 minutos como mínimo y avanzar de 5 en 5. El precio no puede ser negativo.'
      }
    }
    if (targetStep === 3 && !availabilityIsSet(availability)) {
      return 'Habilitá al menos un día y una franja horaria para recibir reservas.'
    }
    if (targetStep === 4) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ingresá un email válido.'
      const weak = passwordProblem(password)
      if (weak) return weak
      if (!acceptedLegal) return 'Para crear tu cuenta tenés que aceptar los Términos y la Política de privacidad.'
    }
    return null
  }

  function continueStep() {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep(current => Math.min(current + 1, 4))
  }

  function goBackStep() {
    setError(null)
    setStep(current => Math.max(current - 1, 1))
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey)
      setDraftRead({ draft: null, error: null })
      setStep(1)
      setOwnerName('')
      setBusinessName('')
      setSlug('')
      setEmail('')
      setPassword('')
      setServices([{ name: '', duration: 30, price: 0 }])
      setAvailability(emptyAvailability())
      setDraftStatus(null)
    } catch (discardError) {
      const detail = discardError instanceof Error ? friendlyError(discardError.message) : 'No se pudo borrar el borrador.'
      setDraftStatus(`No pudimos borrar el borrador: ${detail}`)
    }
  }

  async function finish() {
    for (let stepToValidate = 1; stepToValidate <= 4; stepToValidate += 1) {
      const validationError = validateStep(stepToValidate)
      if (validationError) {
        setStep(stepToValidate)
        setError(validationError)
        return
      }
    }

    setError(null)
    setBusy(true)

    let userId = createdUserId ?? session?.user.id ?? null
    if (!userId) {
      let signUpError: string | null
      try {
        signUpError = await signUp(email.trim(), password, ownerName.trim())
      } catch (signUpFailure) {
        setBusy(false)
        const detail = signUpFailure instanceof Error ? friendlyError(signUpFailure.message) : 'error inesperado'
        setError(`No pudimos crear la cuenta por un problema de conexión: ${detail}`)
        return
      }
      if (signUpError) {
        setBusy(false)
        setError(authErrorMessage(signUpError))
        return
      }

      let activeUserId: string | null = null
      try {
        const { data: { session: activeSession }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          setBusy(false)
          setError(`La cuenta se creó, pero no pudimos verificar la sesión: ${authErrorMessage(sessionError.message)}`)
          return
        }
        activeUserId = activeSession?.user.id ?? null
      } catch (sessionFailure) {
        setBusy(false)
        const detail = sessionFailure instanceof Error ? friendlyError(sessionFailure.message) : 'error inesperado'
        setError(`La cuenta se creó, pero no pudimos verificar la sesión: ${detail}`)
        return
      }
      userId = activeUserId
      if (userId) setCreatedUserId(userId)
    }

    if (!userId) {
      try {
        localStorage.setItem('reser-pending-setup', JSON.stringify({
          name: businessName.trim(),
          slug: slugify(slug),
          services: services.filter(service => service.name.trim() !== ''),
          availability,
        }))
      } catch (storageError) {
        setBusy(false)
        const detail = storageError instanceof Error ? friendlyError(storageError.message) : 'No se pudo guardar el avance.'
        setError(`No pudimos guardar los datos del negocio para retomarlos después de confirmar el email: ${detail}`)
        return
      }
      const cleanupError = removeLocalDraft()
      if (cleanupError) console.error('No se pudo borrar el borrador de onboarding:', cleanupError)
      setBusy(false)
      setAwaitingConfirmation(true)
      return
    }

    let setupError: string | null
    try {
      setupError = await createBusinessWithSetup(userId, {
        name: businessName.trim(),
        slug: slugify(slug),
        services: services.filter(service => service.name.trim() !== ''),
        availability,
      })
    } catch (setupFailure) {
      setBusy(false)
      const detail = setupFailure instanceof Error ? friendlyError(setupFailure.message) : 'error inesperado'
      setError(`No pudimos guardar el negocio: ${detail}. Tu avance sigue guardado; volvé a intentar.`)
      return
    }
    setBusy(false)
    if (setupError) {
      setError(setupError === SLUG_TAKEN
        ? 'Ese enlace ya está en uso. Elegí otro.'
        : `No pudimos guardar el negocio: ${setupError}. Tu avance sigue guardado; corregí el problema y volvé a intentar.`)
      return
    }

    const cleanupError = removeLocalDraft()
    if (cleanupError) console.error('No se pudo borrar el borrador de onboarding:', cleanupError)
    onFinish()
  }

  // El alta no termina en un callejón: dice qué falta, dónde abrir el enlace (lo cargado queda en este navegador) y deja pedir otro mail
  // Una cuenta de empleado no puede tener negocio propio (migración 042): si lo creara, dejaría de ver su agenda
  if (session && role === 'staff') {
    return <main className="onboarding">
      <header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header>
      <section className="onboarding-card">
        <span className="onboarding-icon"><UsersRound size={25} /></span>
        <h1>Esta cuenta ya es parte de un equipo.</h1>
        <p>Entraste con la cuenta de profesional de <strong>{staffBusiness?.name ?? 'un negocio'}</strong>. Para crear tu propio negocio, cerrá sesión y registrate con otro email.</p>
        <button type="button" className="button button--primary" onClick={onFinish}>Ir a mi agenda</button>
      </section>
    </main>
  }

  // Último paso: el código de 6 dígitos del mail. Al confirmarlo entra al panel, que retoma lo que cargó en este navegador
  if (awaitingConfirmation) {
    return <AuthShell stage={4} onBack={onBack} backLabel="Volver al inicio">
      <EmailCode email={email.trim()} onVerified={onFinish} />
    </AuthShell>
  }

  // La reserva de la izquierda avanza con los pasos: servicio, día, horario y, al crear la cuenta, confirmado
  return <AuthShell stage={step as 1 | 2 | 3 | 4} onBack={onBack} backLabel="Salir">
    <div
      className="onboarding-progress"
      role="progressbar"
      aria-label="Progreso de configuración"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={step}
    >
      <span style={{ transform: `scaleX(${step / 4})` }} />
    </div>
    <form
      className="auth-form auth-onboarding"
      noValidate
      onSubmit={event => {
        event.preventDefault()
        if (draftRead.error) return
        if (step < 4) continueStep()
        else void finish()
      }}
    >
      <div className="onboarding-step-heading">
        <p className="eyebrow">Configuración inicial · {step}/4</p>
        <span>Unos minutos para dejar lista tu agenda</span>
      </div>

      {draftRead.draft && (
        <p className="draft-notice" role="status">Retomamos el borrador que guardaste en este dispositivo.</p>
      )}
      {draftRead.error && (
        <div className="draft-notice draft-notice--error" role="alert">
          <span>No pudimos recuperar tu borrador ({draftRead.error}). Descartalo para empezar de nuevo; hasta entonces no se guardarán cambios.</span>
          <button type="button" onClick={discardDraft}><Trash2 size={14} /> Descartar borrador</button>
        </div>
      )}
      {!draftRead.error && draftStatus && <p className="draft-status" role="status">{draftStatus}</p>}

      {/* Cada paso entra con una transición corta (sin esperar la salida del anterior, así el foco va directo al título) */}
      <motion.div key={step} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
      {step === 1 && (<>
        <span className="onboarding-icon"><Store size={25} /></span>
        <h1 ref={stepHeadingRef} tabIndex={-1}>Empecemos por tu negocio.</h1>
        <p>Este nombre va a aparecer en tu página de reservas.</p>
        <label className="onboarding-field">Tu nombre
          <input required autoComplete="name" placeholder="Ej: Nicolás" value={ownerName} autoCapitalize="words" onChange={e => setOwnerName(field.personName(e.target.value))} />
        </label>
        <label className="onboarding-field">Nombre del negocio
          <input required autoComplete="organization" placeholder="Ej: Peluquería López" value={businessName} onChange={e => setBusinessName(field.freeText(e.target.value))} />
        </label>
        <label className="onboarding-field">Tu enlace de RESER
          <div className="url-field">
            <span>{window.location.host}/</span>
            <input required autoComplete="off" placeholder="tu-negocio" value={slug} onChange={e => setSlug(field.slugText(e.target.value))} />
          </div>
        </label>
      </>)}

      {step === 2 && (<>
        <span className="onboarding-icon"><Sparkles size={25} /></span>
        <h1 ref={stepHeadingRef} tabIndex={-1}>¿Qué servicios ofrecés?</h1>
        <p>Empezá con uno; después vas a poder editarlos o sumar más.</p>
        <div className="setup-services">
          {services.map((service, index) => (
            <fieldset className="setup-service" key={index}>
              <legend>Servicio {index + 1}</legend>
              <label className="onboarding-field">Nombre del servicio
                <input
                  required
                  placeholder="Ej: Corte de pelo"
                  value={service.name}
                  onChange={event => setServices(current => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: field.freeText(event.target.value) } : item))}
                />
              </label>
              <div className="setup-service-details">
                <label className="onboarding-field">Duración (minutos)
                  <input
                    type="number"
                    required
                    min={5}
                    step={5}
                    value={service.duration}
                    onKeyDown={field.digitsOnlyKeys}
                    onChange={event => setServices(current => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, duration: Number(event.target.value) } : item))}
                  />
                </label>
                <label className="onboarding-field">Precio ($)
                  <input
                    type="number"
                    required
                    min={0}
                    step={100}
                    value={service.price}
                    onKeyDown={field.digitsOnlyKeys}
                    onChange={event => setServices(current => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, price: Number(event.target.value) } : item))}
                  />
                </label>
              </div>
              {services.length > 1 && (
                <button
                  type="button"
                  className="service-remove"
                  onClick={() => setServices(current => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Eliminar servicio
                </button>
              )}
            </fieldset>
          ))}
          <div className="add-service">
            <button type="button" onClick={() => setServices(current => [...current, { name: '', duration: 30, price: 0 }])}>
              + Agregar otro servicio
            </button>
          </div>
        </div>
      </>)}

      {step === 3 && (<>
        <span className="onboarding-icon"><Clock3 size={25} /></span>
        <h1 ref={stepHeadingRef} tabIndex={-1}>¿Cuándo atendés?</h1>
        <p>Elegí una plantilla o definí tus horarios. Podés ajustar cada día y agregar una pausa.</p>
        <AvailabilityEditor days={days} availability={availability} onChange={setAvailability} />
      </>)}

      {step === 4 && (<>
        <span className="onboarding-icon"><Mail size={25} /></span>
        <h1 ref={stepHeadingRef} tabIndex={-1}>Tu agenda está lista.</h1>
        <p>Creá tu cuenta para guardar la configuración y empezar a recibir reservas.</p>
        <div className="ready-card">
          <Check size={20} />
          <span><strong>Configuración lista</strong><small>Podés cambiar tus servicios y horarios desde el panel.</small></span>
        </div>
        <label className="onboarding-field">Email de tu cuenta
          <input required type="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(field.email(e.target.value))} />
        </label>
        <label className="onboarding-field">Contraseña
          <PasswordInput required minLength={6} autoComplete="new-password" placeholder="Ej: Turnos2026" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <p className="form-note" style={{ margin: '-4px 0 10px' }}>{PASSWORD_HINT}</p>
        <label className="legal-consent">
          <input type="checkbox" checked={acceptedLegal} onChange={e => setAcceptedLegal(e.target.checked)} />
          <span>Leí y acepto los <a href="/terminos" target="_blank" rel="noreferrer">Términos y condiciones</a> y la <a href="/privacidad" target="_blank" rel="noreferrer">Política de privacidad</a>. Entiendo que, como negocio, voy a tratar datos de mis clientes.</span>
        </label>
      </>)}

      </motion.div>

      {error && <p ref={errorRef} className="form-error" id="onboarding-error" role="alert" tabIndex={-1}>{error}</p>}
      <div className="onboarding-actions">
        {step > 1 && (
          <button type="button" className="button button--secondary" disabled={busy} onClick={goBackStep}>
            <ArrowLeft size={17} /> Atrás
          </button>
        )}
        <button
          type="submit"
          className="button button--primary button--full"
          disabled={busy || Boolean(draftRead.error)}
        >
          {busy ? 'Creando tu cuenta…' : step === 4 ? 'Crear mi cuenta' : 'Continuar'}
          {!busy && <ArrowRight size={18} />}
        </button>
      </div>
    </form>
  </AuthShell>
}
