import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Brand } from './Brand'
import { useAuth } from '../lib/auth'

export function Login({ onBack }: { onBack: () => void }) {
  const { signIn, requestPasswordReset } = useAuth()
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email, password)
    setBusy(false)
    if (err) setError('Email o contraseña incorrectos')
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await requestPasswordReset(email)
    setBusy(false)
    if (err) setError('No pudimos enviar el mail. Probá de nuevo en unos minutos.')
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
            <input type="email" required placeholder="tu@email.com" value={email}
              onChange={e => setEmail(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
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
        <p>Ingresá con el email y la contraseña de tu negocio.</p>
        <form onSubmit={handleSubmit}>
          <label className="onboarding-field">Email
            <input type="email" required placeholder="tu@email.com" value={email}
              onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="onboarding-field">Contraseña
            <input type="password" required minLength={6} placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button--primary button--full" type="submit" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button className="text-button" type="button" onClick={() => { setForgot(true); setError(null) }}>¿Olvidaste tu contraseña?</button>
        </form>
      </section>
    </main>
  )
}
