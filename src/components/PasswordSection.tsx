import { useState } from 'react'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'

// Cambiar la contraseña desde el panel (Configuración), sin pasar por el mail de "olvidé mi contraseña".
// Pide la actual (la base la compara, migración 044) y updatePassword también rechaza las contraseñas filtradas.
// Si no se acuerda de la actual, se verifica por el email: el mismo enlace de "olvidé mi contraseña" (ResetPassword).
export function PasswordSection() {
  const { updatePassword, requestPasswordReset, session } = useAuth()
  const email = session?.user.email ?? ''
  const [mailSent, setMailSent] = useState(false)
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

  async function sendLink() {
    setBusy(true)
    setError(null)
    const err = await requestPasswordReset(email)
    setBusy(false)
    if (err) { setError(authErrorMessage(err)); return }
    setMailSent(true)
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
      <p className="password-forgot">
        {mailSent
          ? <>Te mandamos un enlace a <strong>{email}</strong>. Abrilo en este navegador para elegir la contraseña nueva (mirá también en spam).</>
          : <>¿No te acordás de la actual? <button type="button" className="text-button" disabled={busy || !email} onClick={() => void sendLink()}>Te mandamos un enlace a tu email</button></>}
      </p>
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
