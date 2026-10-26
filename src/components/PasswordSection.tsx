import { useState } from 'react'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'

// Cambiar la contraseña desde el panel (Configuración), sin pasar por el mail de "olvidé mi contraseña".
// Pide la actual (la base la compara, migración 044) y updatePassword también rechaza las contraseñas filtradas.
export function PasswordSection() {
  const { updatePassword } = useAuth()
  const [current, setCurrent] = useState('')
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
    const { data: currentOk, error: checkError } = await supabase.rpc('verify_current_password', { p_password: current })
    if (checkError || !currentOk) {
      setBusy(false)
      setError(checkError ? authErrorMessage(checkError.message) : 'La contraseña actual no es correcta.')
      return
    }
    const err = await updatePassword(password)
    setBusy(false)
    if (err) { setError(authErrorMessage(err)); return }
    setCurrent('')
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
      <label className="onboarding-field">Contraseña actual
        <PasswordInput required autoComplete="current-password" placeholder="••••••••"
          value={current} onChange={event => { setCurrent(event.target.value); setSaved(false) }} />
      </label>
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
      <button className="button button--secondary button--small" type="submit" disabled={busy || !current || !password || !repeat}>
        {busy ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  </section>
}
