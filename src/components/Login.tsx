import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Brand } from './Brand'
import { useAuth } from '../lib/auth'

export function Login({ onBack }: { onBack: () => void }) {
  const { signIn } = useAuth()
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
        </form>
      </section>
    </main>
  )
}
