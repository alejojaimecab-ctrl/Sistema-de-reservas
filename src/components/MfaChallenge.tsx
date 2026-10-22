import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { OtpInput, type OtpStatus } from './OtpInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage } from '../lib/authMessages'

// Segundo paso del ingreso: la contraseña ya estaba bien, falta el código de la app autenticadora.
// Hasta verificarlo la base no devuelve datos (migración 043).
export function MfaChallenge() {
  const { verifyMfa, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<OtpStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    setStatus('checking')
    const err = await verifyMfa(value)
    if (err) {
      setBusy(false)
      setStatus('error')
      setError(authErrorMessage(err))
      window.setTimeout(() => setCode(''), 700)
      return
    }
    // Con el código bien, la sesión pasa a aal2 y la app sigue sola al panel
    setStatus('ok')
  }

  return <AuthShell stage={4} onBack={() => void signOut()} backLabel="Salir">
    <form className="auth-form" onSubmit={event => { event.preventDefault(); if (code.length === 6) void verify(code) }}>
      <span className="auth-badge"><ShieldCheck size={20} /></span>
      <h1>Un paso más.</h1>
      <p className="auth-lead">Abrí tu app autenticadora y escribí el código de 6 dígitos de RESER.</p>
      <OtpInput length={6} value={code} onChange={value => { setCode(value); setError(null); setStatus(undefined) }}
        onComplete={value => void verify(value)} disabled={busy} status={status} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" type="submit" disabled={busy || code.length !== 6}>
        {status === 'ok' ? '¡Listo!' : busy ? 'Verificando…' : 'Verificar'}
      </button>
      <p className="form-note auth-hint">¿Perdiste el celular? Escribinos desde el email de tu cuenta y te ayudamos a recuperarla.</p>
    </form>
  </AuthShell>
}
