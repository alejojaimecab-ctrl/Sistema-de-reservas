import { useState } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { EmailCode } from './EmailCode'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage } from '../lib/authMessages'
import { email as cleanEmail } from '../lib/fieldRules'

const UNCONFIRMED = 'Todavía no confirmaste tu email. Escribí el código que te mandamos por mail; si no lo encontrás, te mandamos otro.'

// Ingreso: el formulario, recuperar la contraseña y, si la cuenta no está confirmada, el código del mail.
// La reserva de la izquierda se repite sola y, al tocar "Ingresar", llega a "Turno confirmado" mientras entra.
export function Login({ onBack, onCreateAccount }: { onBack: () => void; onCreateAccount: () => void }) {
  const { signIn, requestPasswordReset, resendConfirmation } = useAuth()
  const [view, setView] = useState<'login' | 'forgot' | 'code'>('login')
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Recién registrado y sin confirmar el mail: no es que la contraseña esté mal, falta el código del mail
  const [unconfirmed, setUnconfirmed] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setUnconfirmed(false)
    const err = await signIn(email, password)
    if (!err) return // con la sesión iniciada, la app pasa sola al panel
    setBusy(false)
    if (/email not confirmed/i.test(err)) { setUnconfirmed(true); setError(UNCONFIRMED); return }
    setError(authErrorMessage(err))
  }

  async function openCode() {
    setError(null)
    const err = await resendConfirmation(email)
    if (err) { setError(authErrorMessage(err)); return }
    setView('code')
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await requestPasswordReset(email)
    setBusy(false)
    if (err) setError(/rate limit|too many/i.test(err) ? authErrorMessage(err) : 'No pudimos enviar el mail. Probá de nuevo en unos minutos.')
    else setSent(true)
  }

  if (view === 'code') return <AuthShell stage={3} onBack={onBack} backLabel="Volver al inicio">
    <EmailCode email={email} onVerified={() => undefined} onCancel={() => { setView('login'); setUnconfirmed(false) }} cancelLabel="Volver a iniciar sesión" />
  </AuthShell>

  if (view === 'forgot') return <AuthShell stage="loop" onBack={onBack} backLabel="Volver al inicio">
    <form className="auth-form" onSubmit={handleReset}>
      <span className="auth-badge"><KeyRound size={20} /></span>
      <h1>Recuperá tu contraseña.</h1>
      <p className="auth-lead">{sent
        ? 'Si ese email tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisá también la carpeta de spam.'
        : 'Escribí el email de tu cuenta y te mandamos un enlace para crear una contraseña nueva.'}</p>
      {!sent && <>
        <label className="onboarding-field">Email
          <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(cleanEmail(e.target.value))} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--full" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme el enlace'}</button>
      </>}
      <button className="text-button auth-cancel" type="button" onClick={() => { setView('login'); setSent(false); setError(null) }}>Volver a iniciar sesión</button>
    </form>
  </AuthShell>

  return <AuthShell stage={busy ? 4 : 'loop'} onBack={onBack} backLabel="Volver al inicio">
    <form className="auth-form" onSubmit={handleSubmit}>
      <span className="auth-spark" aria-hidden="true">✳</span>
      <h1>Hola de nuevo.</h1>
      <p className="auth-lead">Ingresá para ver tu agenda, tus reservas y tus clientes.</p>
      <label className="onboarding-field">Email
        <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(cleanEmail(e.target.value))} />
      </label>
      {/* El enlace va afuera del label: adentro el navegador lo tomaba como parte del campo (se encendía al pasar
          por la contraseña y tocar "Contraseña" lo abría) */}
      <div className="auth-password">
        <label className="onboarding-field">Contraseña
          <PasswordInput required minLength={6} autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="text-button auth-forgot" type="button" onClick={() => { setView('forgot'); setError(null); setUnconfirmed(false) }}>¿Olvidaste tu contraseña?</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {unconfirmed && <button type="button" className="button button--secondary button--full" onClick={() => void openCode()}>Ingresar el código del mail</button>}
      <button className="button button--primary button--full" type="submit" disabled={busy}>
        {busy ? 'Ingresando…' : <>Ingresar <ArrowRight size={17} aria-hidden="true" /></>}
      </button>
      <p className="auth-switch">¿Todavía no tenés cuenta? <button type="button" className="text-button" onClick={onCreateAccount}>Creá tu negocio</button></p>
    </form>
  </AuthShell>
}
