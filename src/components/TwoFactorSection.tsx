import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../lib/authMessages'
import { copyText } from '../lib/clipboard'
import { useConfirm } from './ConfirmDialog'
import { OtpInput, type OtpStatus } from './OtpInput'

// Verificación en dos pasos del dueño (Configuración): además de la contraseña, un código de 6 dígitos de una app
// autenticadora. La base exige el código a quien la activó (migración 043).
type Setup = { factorId: string; qr: string; secret: string }

export function TwoFactorSection() {
  const { confirm, dialog } = useConfirm()
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined) // undefined: cargando
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<OtpStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) =>
      setFactorId(data?.totp.find(factor => factor.status === 'verified')?.id ?? null))
  }, [])

  async function start() {
    setBusy(true)
    setError(null)
    setNotice(null)
    // Un intento anterior sin terminar deja un factor sin verificar con el mismo nombre: se borra antes de empezar
    const { data: listed } = await supabase.auth.mfa.listFactors()
    for (const factor of listed?.all ?? []) {
      if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RESER' })
    setBusy(false)
    if (enrollError || !data) { setError(authErrorMessage(enrollError?.message ?? 'No pudimos empezar la activación.')); return }
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirmCode(value: string) {
    if (!setup || busy) return
    setBusy(true)
    setError(null)
    setStatus('checking')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code: value })
    setBusy(false)
    if (verifyError) {
      setStatus('error')
      setError(authErrorMessage(verifyError.message))
      window.setTimeout(() => setCode(''), 700)
      return
    }
    setStatus('ok')
    window.setTimeout(() => {
      setFactorId(setup.factorId)
      setSetup(null)
      setCode('')
      setStatus(undefined)
      setNotice('Listo: desde ahora, al ingresar te vamos a pedir el código de la app.')
    }, 900)
  }

  async function turnOff() {
    if (!factorId) return
    const accepted = await confirm({
      title: '¿Desactivar la verificación en dos pasos?',
      message: 'Con la contraseña sola alcanza para entrar a tu cuenta. Si alguien la consigue, puede ver tus reservas y los datos de tus clientes.',
      confirmLabel: 'Desactivar',
      cancelLabel: 'Mantenerla',
      danger: true,
    })
    if (!accepted) return
    setBusy(true)
    setError(null)
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(false)
    if (unenrollError) { setError(authErrorMessage(unenrollError.message)); return }
    setFactorId(null)
    setNotice('Desactivada. Podés volver a activarla cuando quieras.')
  }

  async function cancelSetup() {
    if (setup) await supabase.auth.mfa.unenroll({ factorId: setup.factorId })
    setSetup(null)
    setCode('')
    setStatus(undefined)
    setError(null)
  }

  return <section className="agenda-card two-factor">
    <div className="card-heading">
      <div>
        <h2>Verificación en dos pasos</h2>
        <p className="form-note">Además de la contraseña, para entrar te pedimos un código que cambia cada 30 segundos en tu celular.</p>
      </div>
      {factorId && <span className="two-factor-on"><ShieldCheck size={15} aria-hidden="true" /> Activada</span>}
    </div>

    {factorId === undefined && <p className="form-note">Cargando…</p>}

    {factorId === null && !setup && <button type="button" className="button button--primary button--small" disabled={busy} onClick={() => void start()}>
      {busy ? 'Preparando…' : 'Activar'}
    </button>}

    {setup && <div className="two-factor-setup">
      <ol className="two-factor-steps">
        <li>Instalá una app autenticadora en tu celular: Google Authenticator, Microsoft Authenticator o la que prefieras.</li>
        <li>En la app, tocá "Agregar" y escaneá este código QR.</li>
        <li>Escribí acá abajo los 6 números que te muestra la app.</li>
      </ol>
      <div className="two-factor-qr">
        <img src={setup.qr} alt="Código QR para la app autenticadora" width={168} height={168} />
        <div>
          <p className="form-note">¿No podés escanearlo? Cargá esta clave a mano:</p>
          <button type="button" className="two-factor-secret" onClick={() => void copyText(setup.secret).then(ok => ok && setNotice('Clave copiada.'))}>
            {setup.secret.match(/.{1,4}/g)?.join(' ')}
          </button>
        </div>
      </div>
      <OtpInput length={6} value={code} onChange={value => { setCode(value); setError(null); setStatus(undefined) }}
        onComplete={value => void confirmCode(value)} disabled={busy || status === 'ok'} status={status} />
      <button type="button" className="text-button" onClick={() => void cancelSetup()}>Cancelar</button>
    </div>}

    {factorId && <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void turnOff()}>Desactivar</button>}

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && !error && <p className="form-note" role="status">{notice}</p>}
    {dialog}
  </section>
}
