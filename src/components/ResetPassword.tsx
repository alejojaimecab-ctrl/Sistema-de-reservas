import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Brand } from './Brand'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'

// Se muestra cuando la persona llega desde el mail de "olvidé mi contraseña".
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    const weak = passwordProblem(password)
    if (weak) { setError(weak); return }
    setBusy(true)
    setError(null)
    const err = await updatePassword(password)
    setBusy(false)
    if (err) {
      const friendly = authErrorMessage(err)
      setError(friendly !== err ? friendly : 'No pudimos guardar la contraseña. Pedí un enlace nuevo e intentá de nuevo.')
      return
    }
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }

  return (
    <main className="onboarding">
      <header><Brand /></header>
      <section className="onboarding-card">
        <span className="onboarding-icon"><KeyRound size={25} /></span>
        <h1>Elegí tu contraseña nueva.</h1>
        <p>Después de guardarla vas a entrar directo a tu panel. {PASSWORD_HINT}</p>
        <form onSubmit={handleSubmit}>
          <label className="onboarding-field">Contraseña nueva
            <PasswordInput required minLength={6} autoComplete="new-password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <label className="onboarding-field">Repetila
            <PasswordInput required minLength={6} autoComplete="new-password" placeholder="••••••••"
              value={confirm} onChange={e => setConfirm(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--full" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </section>
    </main>
  )
}
