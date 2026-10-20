import { useEffect, useId, useState, type FormEvent } from 'react'
import { SegmentIndicator } from './SegmentIndicator'
import { Mail, UsersRound } from 'lucide-react'
import { Brand } from './Brand'
import { PasswordInput } from './PasswordInput'
import { useAuth } from '../lib/auth'
import { authLinkError, supabase } from '../lib/supabase'
import { authErrorMessage, passwordProblem, PASSWORD_HINT } from '../lib/authMessages'
import { acceptStaffInvite, getStaffInvite, type StaffInviteInfo } from '../lib/db'
import { joinUrl } from '../lib/routes'
import { email as cleanEmail, personName } from '../lib/fieldRules'

// Si la persona crea su cuenta y tiene que confirmar el mail, la invitación se recuerda en este
// dispositivo: al volver (aunque el enlace del mail la deje en el inicio) el panel le ofrece aceptarla.
const PENDING_INVITE_KEY = 'reser-pending-invite'

export function readPendingInvite(): string | null {
  try { return localStorage.getItem(PENDING_INVITE_KEY) } catch { return null }
}

export function forgetPendingInvite() {
  try { localStorage.removeItem(PENDING_INVITE_KEY) } catch { /* sin almacenamiento no hay nada que borrar */ }
}

function rememberInvite(token: string) {
  try { localStorage.setItem(PENDING_INVITE_KEY, token) } catch { /* el enlace del mail igual vuelve a /unirme */ }
}

function useInvite(token: string) {
  const [invite, setInvite] = useState<StaffInviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    getStaffInvite(token).then(result => {
      if (!active) return
      setInvite(result.invite)
      setError(result.error)
      setLoading(false)
      if (result.invite && !result.invite.expired) rememberInvite(token)
      else forgetPendingInvite()
    })
    return () => { active = false }
  }, [token])
  return { invite, error, loading }
}

function inviteSummary(invite: StaffInviteInfo) {
  const who = invite.professional_name ? `Te invitaron como ${invite.professional_name}.` : 'Te invitaron a sumarte al equipo.'
  return `${who} Con tu cuenta vas a ver tu agenda y tus reservas, cargar y cancelar tus turnos y elegir tus horarios.`
}

// Página /unirme/<token>
export function JoinTeam({ token, onBack, onJoined }: { token: string; onBack: () => void; onJoined: () => void }) {
  const { session, role, business } = useAuth()
  const { invite, error, loading } = useInvite(token)

  let content
  if (role === 'staff' && business) {
    content = <>
      <span className="onboarding-icon"><UsersRound size={25} /></span>
      <h1>Ya sos parte del equipo.</h1>
      <p>Formás parte de <strong>{business.name}</strong>. Tu agenda y tus reservas te esperan en el panel.</p>
      <button className="button button--primary button--full" type="button" onClick={onJoined}>Ir a mi panel</button>
    </>
  } else if (authLinkError && !session) {
    // Se abrió un mail de confirmación viejo o vencido: la invitación puede seguir bien, el problema es el mail.
    content = <>
      <span className="onboarding-icon"><Mail size={25} /></span>
      <h1>Ese enlace del mail ya no sirve.</h1>
      <p>Pasa si abrís un mail viejo o si el enlace venció. Abrí el último mail que te mandamos, o pedí uno nuevo:</p>
      <ResendConfirmation />
    </>
  } else if (loading) {
    content = <p role="status">Abriendo la invitación…</p>
  } else if (!invite) {
    content = <>
      <span className="onboarding-icon"><UsersRound size={25} /></span>
      <h1>Invitación no válida.</h1>
      <p>{error}</p>
    </>
  } else if (invite.expired) {
    content = <>
      <span className="onboarding-icon"><UsersRound size={25} /></span>
      <h1>Esta invitación venció.</h1>
      <p>Los enlaces duran 7 días. Pedile a {invite.business_name} que te mande uno nuevo desde la sección Equipo.</p>
    </>
  } else {
    content = <>
      <span className="onboarding-icon"><UsersRound size={25} /></span>
      <h1>Sumate a {invite.business_name}.</h1>
      <p>{inviteSummary(invite)}</p>
      {session ? <AcceptInvite token={token} onJoined={onJoined} /> : <InviteAuth token={token} invite={invite} />}
    </>
  }

  return <main className="onboarding">
    <header><Brand /><button className="text-button" onClick={onBack}>Volver al inicio</button></header>
    <section className="onboarding-card">{content}</section>
  </main>
}

// Dentro del panel, para quien confirmó su mail y volvió al inicio sin pasar por /unirme.
export function PendingInviteCard({ token, onDiscard }: { token: string; onDiscard: () => void }) {
  const { invite, error, loading } = useInvite(token)
  const usable = invite && !invite.expired
  return <section className="agenda-card" style={{ maxWidth: 520 }}>
    <div className="card-heading"><div><p className="eyebrow">Invitación</p><h2>{usable ? `Sumate a ${invite.business_name}` : 'Tu invitación'}</h2></div></div>
    {loading ? <p className="form-note" role="status">Abriendo la invitación…</p>
      : !invite ? <p className="form-error">{error}</p>
      : invite.expired ? <p className="form-error">La invitación de {invite.business_name} venció. Pedile al dueño un enlace nuevo.</p>
      : <>
        <p className="section-description">{inviteSummary(invite)}</p>
        <AcceptInvite token={token} onJoined={() => undefined} />
      </>}
    <button className="text-button" type="button" style={{ marginTop: 12 }} onClick={() => { forgetPendingInvite(); onDiscard() }}>
      {usable ? 'No, quiero crear mi propio negocio' : 'Crear mi propio negocio'}
    </button>
  </section>
}

function AcceptInvite({ token, onJoined }: { token: string; onJoined: () => void }) {
  const { session, role, business, signOut, refreshBusiness } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (role === 'owner') return <>
    <p className="form-error">Estás con la cuenta de {business?.name ?? 'tu negocio'}, que ya es dueña de un negocio en RESER. Para sumarte como profesional, cerrá sesión y entrá con otra cuenta.</p>
    <button className="button button--secondary button--full" type="button" onClick={() => void signOut()}>Cerrar sesión y usar otra cuenta</button>
  </>

  async function accept() {
    setBusy(true)
    setError(null)
    const acceptError = await acceptStaffInvite(token)
    if (acceptError) { setBusy(false); setError(acceptError); return }
    forgetPendingInvite()
    await refreshBusiness()
    setBusy(false)
    onJoined()
  }

  return <>
    <p className="onboarding-hint">Vas a entrar con <strong>{session?.user.email}</strong>.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--primary button--full" type="button" disabled={busy} onClick={() => void accept()}>
      {busy ? 'Sumándote…' : 'Unirme al equipo'}
    </button>
    <button className="text-button" type="button" onClick={() => void signOut()}>Usar otra cuenta</button>
  </>
}

function InviteAuth({ token, invite }: { token: string; invite: StaffInviteInfo }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const modeGroup = useId()
  // Con el enlace de equipo, este nombre es el que el dueño ve en su lista de profesionales
  const [name, setName] = useState(!invite.professional_name || invite.professional_name === 'Principal' ? '' : invite.professional_name)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    if (mode === 'login') {
      const loginError = await signIn(email.trim(), password)
      setBusy(false)
      if (loginError) {
        setError(/not confirmed/i.test(loginError) ? authErrorMessage(loginError) : 'Email o contraseña incorrectos')
      }
      return
    }
    const weak = passwordProblem(password)
    if (weak) { setBusy(false); setError(weak); return }
    const signUpError = await signUp(email.trim(), password, name.trim(), { token, redirectTo: joinUrl(token) })
    if (signUpError) {
      setBusy(false)
      if (signUpError.includes('already registered')) {
        setMode('login')
        setError('Ese email ya tiene una cuenta. Entrá con tu contraseña.')
      } else setError(authErrorMessage(signUpError))
      return
    }
    // Con confirmación de mail activada no hay sesión todavía: hay que confirmar y volver.
    const { data } = await supabase.auth.getSession()
    setBusy(false)
    if (!data.session) setSentTo(email.trim())
  }

  if (sentTo) return <div style={{ marginTop: 8 }}>
    <span className="onboarding-icon"><Mail size={25} /></span>
    <h2 style={{ margin: '8px 0' }}>Revisá tu correo.</h2>
    <p>Te mandamos un email a <strong>{sentTo}</strong> para confirmar tu cuenta. Apenas lo confirmes (desde cualquier dispositivo) quedás en el equipo de {invite.business_name} y ya podés entrar a tu panel.</p>
    <p className="onboarding-hint">¿No llegó? Revisá la carpeta de spam o correo no deseado. Si tenés varios mails de RESER, abrí el último.</p>
    <ResendConfirmation initialEmail={sentTo} />
  </div>

  return <>
    <div className="calendar-mode" role="group" aria-label="Tu cuenta" style={{ margin: '4px 0 14px' }}>
      <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setError(null) }}>{mode === 'signup' && <SegmentIndicator group={modeGroup} />}Crear mi cuenta</button>
      <button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(null) }}>{mode === 'login' && <SegmentIndicator group={modeGroup} />}Ya tengo cuenta</button>
    </div>
    <form onSubmit={event => void submit(event)}>
      {mode === 'signup' && <label className="onboarding-field">Tu nombre
        <input required maxLength={60} autoComplete="name" autoCapitalize="words" value={name} onChange={e => setName(personName(e.target.value))} />
      </label>}
      <label className="onboarding-field">Email
        <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(cleanEmail(e.target.value))} />
      </label>
      <label className="onboarding-field">Contraseña
        <PasswordInput
          required minLength={6}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Ej: Turnos2026' : '••••••••'}
          value={password} onChange={e => setPassword(e.target.value)}
        />
      </label>
      {mode === 'signup' && <p className="form-note" style={{ margin: '-4px 0 10px' }}>{PASSWORD_HINT}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" type="submit" disabled={busy}>
        {busy ? (mode === 'signup' ? 'Creando tu cuenta…' : 'Ingresando…') : (mode === 'signup' ? 'Crear cuenta y seguir' : 'Ingresar y seguir')}
      </button>
    </form>
  </>
}

// Reenvía el mail de confirmación de una cuenta nueva. El vínculo con el equipo no depende de esta página:
// lo hace la base al confirmar (migración 032). Supabase limita cuántos mails se mandan por hora.
function ResendConfirmation({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSent(false)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    setBusy(false)
    if (resendError) setError(authErrorMessage(resendError.message))
    else setSent(true)
  }

  return <form onSubmit={event => void resend(event)} style={{ marginTop: 10 }}>
    {!initialEmail && <label className="onboarding-field">Tu email
      <input type="email" required autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(cleanEmail(e.target.value))} />
    </label>}
    {sent && <p className="form-note" role="status">Listo: te mandamos un mail nuevo. Abrí ese, el más reciente.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className={initialEmail ? 'text-button' : 'button button--primary button--full'} type="submit" disabled={busy || !email.trim()}>
      {busy ? 'Enviando…' : 'Reenviarme el mail'}
    </button>
  </form>
}
