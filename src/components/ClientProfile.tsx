import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CalendarX, Mail, Phone, X } from 'lucide-react'
import { priceLabel } from '../data/demo'
import { getClientProfile, type ClientProfile as Profile, type Reservation } from '../lib/db'
import { telHref } from '../lib/routes'

type ProfileReservation = Profile['reservations'][number]

const HISTORY_SHOWN = 6

const dayTime = (iso: string) => new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
// "21 oct" si es de este año, "21 oct 2025" si no
const shortDay = (iso: string) => {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('es-AR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '').replace(/ de /g, ' ')
}
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?'
}

// El estado de cada turno, dicho como lo diría el dueño
function statusLabel(r: ProfileReservation, now: number): { text: string; tone: 'ok' | 'bad' | 'wait' | 'muted' | 'plain' } {
  if (r.status === 'cancelled') return { text: r.cancelled_by === 'client' ? 'Canceló' : 'Cancelado', tone: 'muted' }
  if (r.status === 'completed') return { text: 'Atendido', tone: 'ok' }
  if (r.status === 'no_show') return { text: 'No vino', tone: 'bad' }
  return new Date(r.starts_at).getTime() < now ? { text: 'Sin marcar', tone: 'wait' } : { text: 'Confirmado', tone: 'plain' }
}

// Perfil del cliente: se abre al tocar su nombre. Muestra el turno que tocaste, cómo contactarlo y cómo viene
// con el negocio (cuántas veces vino, cuántas faltó, desde cuándo). Desde acá también se puede cancelar ese turno.
export function ClientProfile({ businessId, reservation, showProfessional, onClose, onCancel }: {
  businessId: string
  reservation: Reservation | null
  showProfessional: boolean
  onClose: () => void
  onCancel: (reservation: Reservation) => Promise<boolean> | void
}) {
  const reduceMotion = useReducedMotion()
  return createPortal(<AnimatePresence>
    {reservation && <ProfilePanel key={reservation.id} businessId={businessId} reservation={reservation} showProfessional={showProfessional} onClose={onClose} onCancel={onCancel} reduceMotion={Boolean(reduceMotion)} />}
  </AnimatePresence>, document.body)
}

function ProfilePanel({ businessId, reservation, showProfessional, onClose, onCancel, reduceMotion }: {
  businessId: string
  reservation: Reservation
  showProfessional: boolean
  onClose: () => void
  onCancel: (reservation: Reservation) => Promise<boolean> | void
  reduceMotion: boolean
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [retry, setRetry] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches

  useEffect(() => {
    let active = true
    setProfile(null)
    if (!reservation.client_id) { setProfile({ client: null, reservations: [], error: null }); return }
    getClientProfile(businessId, reservation.client_id).then(result => { if (active) setProfile(result) })
    return () => { active = false }
  }, [businessId, reservation.client_id, retry])

  // Foco adentro mientras está abierto, Escape cierra y el foco vuelve al nombre que lo abrió
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // Si arriba hay una pregunta abierta (por ejemplo, confirmar la cancelación), las teclas son de ella
      if (document.querySelector('.confirm-dialog')) return
      if (event.key === 'Escape') { onCloseRef.current(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const inside = panelRef.current.contains(document.activeElement)
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus() }
  }, [])

  const now = Date.now()
  const name = profile?.client?.name ?? reservation.clients?.name ?? 'Cliente'
  const history = profile?.reservations ?? []
  const kept = history.filter(r => r.status !== 'cancelled')
  const attended = history.filter(r => r.status === 'completed').length
  const noShows = history.filter(r => r.status === 'no_show').length
  const rate = attended + noShows > 0 ? Math.round((attended / (attended + noShows)) * 100) : null
  const first = kept.length > 0 ? kept[kept.length - 1].starts_at : null
  const lastVisit = history.find(r => r.status === 'completed')?.starts_at ?? null
  const upcoming = kept.filter(r => r.status === 'confirmed' && new Date(r.starts_at).getTime() >= now && r.id !== reservation.id).reverse()
  const past = history.filter(r => r.id !== reservation.id && new Date(r.starts_at).getTime() < now).slice(0, HISTORY_SHOWN)
  const isFuture = new Date(reservation.starts_at).getTime() > now
  const email = profile?.client?.email
  const phone = profile?.client?.phone

  async function cancelThis() {
    setCancelling(true)
    const cancelled = await onCancel(reservation)
    setCancelling(false)
    if (cancelled) onClose()
  }

  const slide = isPhone ? { y: '100%' } : { x: '100%' }
  const rest = isPhone ? { y: 0 } : { x: 0 }

  return <motion.div className="profile-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <motion.div
      ref={panelRef}
      className="profile-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-name"
      initial={reduceMotion ? { opacity: 0 } : slide}
      animate={reduceMotion ? { opacity: 1 } : { ...rest, transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] } }}
      exit={reduceMotion ? { opacity: 0 } : { ...slide, transition: { duration: 0.2, ease: 'easeIn' } }}
    >
      <header className="profile-header">
        <span className="avatar profile-avatar" aria-hidden="true">{initials(name)}</span>
        <div className="profile-identity">
          <h2 id="profile-name">{name}</h2>
          <p>{first ? `Cliente desde ${monthYear(first)}` : 'Primer turno con tu negocio'}</p>
        </div>
        <button ref={closeRef} type="button" className="icon-button profile-close" aria-label="Cerrar perfil" onClick={onClose}><X size={18} /></button>
      </header>

      {(email || phone) && <div className="profile-contact">
        {email && <a href={`mailto:${email}`}><Mail size={15} aria-hidden="true" /> {email}</a>}
        {phone && <a href={telHref(phone)}><Phone size={15} aria-hidden="true" /> {phone}</a>}
      </div>}

      <section className="profile-section" aria-labelledby="profile-turn">
        <h3 id="profile-turn">Este turno</h3>
        <dl className="profile-facts">
          <div><dt>Día y hora</dt><dd className="is-capitalized">{dayTime(reservation.starts_at)}</dd></div>
          <div><dt>Servicio</dt><dd>{reservation.services?.name ?? 'Servicio'}</dd></div>
          {showProfessional && reservation.resources && <div><dt>Te atiende</dt><dd>{reservation.resources.name}</dd></div>}
          {reservation.services && <div><dt>Precio</dt><dd>{priceLabel(Number(reservation.services.price), reservation.services.price_mode ?? 'fixed')}</dd></div>}
          {reservation.source && <div><dt>Cómo llegó</dt><dd>{reservation.source === 'public' ? 'Reservó por tu enlace' : 'Lo anotaste vos'}</dd></div>}
        </dl>
      </section>

      <section className="profile-section" aria-labelledby="profile-stats" aria-busy={!profile}>
        <h3 id="profile-stats">Con tu negocio</h3>
        {!profile ? <div className="profile-loading" role="status"><span /><span /></div>
          : profile.error ? <p className="form-error" role="alert">No pudimos cargar su historial: {profile.error} <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>
          : <>
            <dl className="profile-stats">
              <div><dt>Turnos</dt><dd>{kept.length}</dd></div>
              <div><dt>Vino</dt><dd>{attended}</dd></div>
              <div><dt>No vino</dt><dd>{noShows}</dd></div>
              <div><dt>Asistencia</dt><dd>{rate === null ? '—' : `${rate}%`}</dd></div>
            </dl>
            <p className="profile-note">{rate === null
              ? 'Cuando marques si vino a sus turnos, acá vas a ver cuánto cumple.'
              : lastVisit ? `Última vez que vino: ${shortDay(lastVisit)}.` : 'Todavía no vino a ningún turno marcado.'}</p>

            {upcoming.length > 0 && <>
              <h4 className="profile-subhead">Otros turnos por delante</h4>
              <ul className="profile-list">{upcoming.slice(0, 3).map(r => <li key={r.id}>
                <span className="profile-list-when">{shortDay(r.starts_at)}</span>
                <span className="profile-list-what">{r.services?.name ?? 'Servicio'}</span>
              </li>)}</ul>
            </>}

            {past.length > 0 && <>
              <h4 className="profile-subhead">Turnos anteriores</h4>
              <ul className="profile-list">{past.map(r => {
                const status = statusLabel(r, now)
                return <li key={r.id}>
                  <span className="profile-list-when">{shortDay(r.starts_at)}</span>
                  <span className="profile-list-what">{r.services?.name ?? 'Servicio'}</span>
                  <span className={`res-status res-status--${status.tone}`}>{status.text}</span>
                </li>
              })}</ul>
            </>}
          </>}
      </section>

      {isFuture && reservation.status === 'confirmed' && <div className="profile-footer">
        <button type="button" className="button button--secondary res-danger" disabled={cancelling} onClick={() => void cancelThis()}>
          <CalendarX size={16} /> {cancelling ? 'Cancelando…' : 'Cancelar este turno'}
        </button>
      </div>}
    </motion.div>
  </motion.div>
}
