import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Brand } from './Brand'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage } from '../lib/authMessages'
import { email as cleanEmail } from '../lib/fieldRules'

const UNCONFIRMED = 'Todavía no confirmaste tu email. Abrí el mail de RESER que te mandamos y tocá el enlace; si no lo encontrás, te mandamos otro.'

export function Login({ onBack, onCreateAccount }: { onBack: () => void; onCreateAccount: () => void }) {
  const { signIn, requestPasswordReset, resendConfirmation } = useAuth()
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Recién registrado y sin confirmar el mail: no es que la contraseña esté mal, falta el enlace del mail
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setUnconfirmed(false)
    setResend('idle')
    const err = await signIn(email, password)
    setBusy(false)
    if (!err) return
    if (/email not confirmed/i.test(err)) { setUnconfirmed(true); setError(UNCONFIRMED); return }
    setError(authErrorMessage(err))
  }

  async function resendEmail() {
    setResend('sending')
    const err = await resendConfirmation(email)
    if (err) { setResend('idle'); setError(authErrorMessage(err)); return }
    setResend('sent')
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

  if (forgot) return (
    <main className="onboarding">
      <header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header>
      <section className="onboarding-card">
        <span className="onboarding-icon"><KeyRound size={25} /></span>
        <h1>Recuperá tu contraseña.</h1>
        {sent
          ? <p>Si ese email tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisá también la carpeta de spam.</p>
          : <p>Escribí el email de tu cuenta y te mandamos un enlace para crear una contraseña nueva.</p>}
        {!sent && <form onSubmit={handleReset}>
          <label className="onboarding-field">Email
            <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email}
              onChange={e => setEmail(cleanEmail(e.target.value))} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--full" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
        </form>}
        <button className="text-button" type="button" onClick={() => { setForgot(false); setSent(false); setError(null) }}>Volver a iniciar sesión</button>
      </section>
    </main>
  )

  return (
    <main className="onboarding">
      <header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header>
      <section className="onboarding-card">
        <span className="onboarding-icon"><LogIn size={25} /></span>
        <h1>Bienvenido de nuevo.</h1>
        <p>Ingresá con el email y la contraseña de tu cuenta.</p>
        <form onSubmit={handleSubmit}>
          <label className="onboarding-field">Email
            <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email}
              onChange={e => setEmail(cleanEmail(e.target.value))} />
          </label>
          <label className="onboarding-field">Contraseña
            <PasswordInput required minLength={6} autoComplete="current-password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {unconfirmed && <div className="login-unconfirmed">
            <button type="button" className="button button--secondary button--full" disabled={resend !== 'idle'} onClick={() => void resendEmail()}>
              {resend === 'sending' ? 'Reenviando…' : resend === 'sent' ? 'Te mandamos otro mail' : 'Reenviar el mail de confirmación'}
            </button>
            {resend === 'sent' && <p className="form-note" role="status">Puede tardar unos minutos. Mirá también en spam o correo no deseado.</p>}
          </div>}
          <button className="button button--primary button--full" type="submit" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button className="text-button" type="button" onClick={() => { setForgot(true); setError(null); setUnconfirmed(false) }}>¿Olvidaste tu contraseña?</button>
        </form>
        <p className="login-signup">¿Todavía no tenés cuenta? <button type="button" className="text-button" onClick={onCreateAccount}>Creá tu negocio</button></p>
      </section>
    </main>
  )
}
