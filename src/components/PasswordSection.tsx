import { useState } from 'react'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'

// Cambiar la contraseña desde el panel (Configuración), sin pasar por el mail de "olvidé mi contraseña".
// updatePassword también rechaza las contraseñas filtradas.
export function PasswordSection() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return }
    const weak = passwordProblem(password)
    if (weak) { setError(weak); return }
    setBusy(true)
    setError(null)
    const err = await updatePassword(password)
    setBusy(false)
    if (err) { setError(authErrorMessage(err)); return }
    setPassword('')
    setRepeat('')
    setSaved(true)
  }

  return <section className="agenda-card two-factor">
    <div className="card-heading">
      <div>
        <h2>Contraseña</h2>
        <p className="form-note">{PASSWORD_HINT}</p>
      </div>
    </div>
    <form className="password-change" onSubmit={event => void save(event)}>
      <label className="onboarding-field">Contraseña nueva
        <PasswordInput required minLength={6} autoComplete="new-password" placeholder="••••••••"
          value={password} onChange={event => { setPassword(event.target.value); setSaved(false) }} />
      </label>
      <label className="onboarding-field">Repetila
        <PasswordInput required minLength={6} autoComplete="new-password" placeholder="••••••••"
          value={repeat} onChange={event => { setRepeat(event.target.value); setSaved(false) }} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="form-note" role="status">Listo, guardamos tu contraseña nueva.</p>}
      <button className="button button--primary button--small" type="submit" disabled={busy || !password || !repeat}>
        {busy ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  </section>
}
