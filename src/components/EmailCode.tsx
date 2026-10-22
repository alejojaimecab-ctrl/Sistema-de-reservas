import { useEffect, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { OtpInput, type OtpStatus } from './OtpInput'
import { useAuth } from '../lib/auth'
import { authErrorMessage } from '../lib/authMessages'

// Confirmar el email de una cuenta nueva con el código de 6 dígitos que llega por mail (OTP).
// Si el mail trae un enlace en vez del código (plantilla vieja), tocarlo también confirma.
const CODE_LENGTH = 6
const RESEND_WAIT = 60
const pause = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export function EmailCode({ email, onVerified, onCancel, cancelLabel }: {
  email: string
  onVerified: () => void
  onCancel?: () => void
  cancelLabel?: string
}) {
  const { verifyEmailCode, resendConfirmation } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<OtpStatus>()
  const [wait, setWait] = useState(RESEND_WAIT)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait(seconds => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  async function verify(value = code) {
    if (value.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setError(null)
    setStatus('checking')
    // La ola de "verificando" dura al menos un ciclo, aunque Supabase conteste al instante
    const [err] = await Promise.all([verifyEmailCode(email, value), pause(900)])
    if (err) {
      setStatus('error')
      setBusy(false)
      setError(/expired|invalid|otp/i.test(err) ? 'Ese código no es válido o ya venció. Revisalo o pedí uno nuevo.' : authErrorMessage(err))
      // Los dígitos tiemblan en rojo y después se borran para escribir otro
      await pause(700)
      setCode('')
      return
    }
    setStatus('ok')
    await pause(900)
    onVerified()
  }

  async function resend() {
    setError(null)
    const err = await resendConfirmation(email)
    if (err) { setError(authErrorMessage(err)); return }
    setResent(true)
    setWait(RESEND_WAIT)
  }

  return <form className="auth-form" onSubmit={event => { event.preventDefault(); void verify() }}>
    <span className="auth-badge"><MailCheck size={20} /></span>
    <h1>Revisá tu email.</h1>
    <p className="auth-lead">Te mandamos un código de {CODE_LENGTH} dígitos a <strong>{email}</strong>. Escribilo acá para confirmar tu cuenta.</p>
    <OtpInput length={CODE_LENGTH} value={code} onChange={value => { setCode(value); setError(null); setStatus(undefined) }} onComplete={value => void verify(value)} disabled={busy || status === 'ok'} status={status} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {resent && !error && <p className="form-note" role="status">Te mandamos otro código. Puede tardar unos minutos; mirá también en spam.</p>}
    <button className="button button--primary button--full" type="submit" disabled={busy || code.length !== CODE_LENGTH}>
      {status === 'ok' ? '¡Listo!' : busy ? 'Verificando…' : 'Verificar'}
    </button>
    <p className="auth-switch">¿No te llegó? {wait > 0
      ? <span>Podés pedir otro en {wait} s</span>
      : <button type="button" className="text-button" onClick={() => void resend()}>Reenviar código</button>}
    </p>
    <p className="form-note auth-hint">Si en el mail te llega un enlace en vez del código, tocalo y entrás igual.</p>
    {onCancel && <button type="button" className="text-button auth-cancel" onClick={onCancel}>{cancelLabel ?? 'Volver'}</button>}
  </form>
}
