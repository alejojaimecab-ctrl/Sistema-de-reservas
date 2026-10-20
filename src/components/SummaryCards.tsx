import { useRef, useState } from 'react'
import { Check, Copy, Download, MessageCircle, QrCode, X } from 'lucide-react'
import { updateReservationStatus, type Reservation } from '../lib/db'
import { copyText } from '../lib/clipboard'
import { bookingUrl } from '../lib/routes'

type MarkStatus = Extract<Reservation['status'], 'confirmed' | 'completed' | 'no_show'>

const SHOWN_PENDING = 5

function clock(date: Date) {
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

// Hoy: primero lo que ya pasó y falta marcar (de eso depende la tasa de asistencia), después lo que queda del día
export function TodayCard({ reservations, loading, showProfessional, onStatusChanged, onSeeAll }: {
  reservations: Reservation[]
  loading: boolean
  showProfessional: boolean
  onStatusChanged: (id: string, status: MarkStatus) => void
  onSeeAll: () => void
}) {
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const time = (r: Reservation) => new Date(r.starts_at).getTime()
  const today = reservations.filter(r => sameDay(new Date(r.starts_at), now))
  const pending = reservations
    .filter(r => r.status === 'confirmed' && time(r) < now.getTime())
    .sort((a, b) => time(b) - time(a))
  const laterToday = today
    .filter(r => r.status === 'confirmed' && time(r) >= now.getTime())
    .sort((a, b) => time(a) - time(b))

  async function mark(reservation: Reservation, status: MarkStatus) {
    const name = reservation.clients?.name ?? 'el cliente'
    setError(null)
    setBusy(current => new Set(current).add(reservation.id))
    const markError = await updateReservationStatus(reservation.id, status)
    setBusy(current => { const next = new Set(current); next.delete(reservation.id); return next })
    if (markError) { setError(`No pudimos marcar el turno de ${name}: ${markError}`); return }
    onStatusChanged(reservation.id, status)
  }

  const detail = (r: Reservation) => `${r.services?.name ?? 'Servicio'}${showProfessional && r.resources ? ` · con ${r.resources.name}` : ''}`

  return <section className="agenda-card today-card" aria-labelledby="today-title">
    <div className="today-heading">
      <h2 id="today-title">Hoy</h2>
      {!loading && <span>{today.length === 0 ? 'Sin turnos' : `${today.length} ${today.length === 1 ? 'turno' : 'turnos'}`}</span>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}

    {loading ? <p className="today-empty" role="status">Cargando tus turnos…</p> : <>
      {pending.length > 0 && <div className="today-group">
        <h3>Para marcar <span>{pending.length}</span></h3>
        <p className="today-hint">Ya pasaron. Marcá si vinieron para que la tasa de asistencia sea real.</p>
        <ul className="today-list">
          {pending.slice(0, SHOWN_PENDING).map(r => {
            const date = new Date(r.starts_at)
            const name = r.clients?.name ?? 'Cliente'
            const isBusy = busy.has(r.id)
            return <li className="today-row" key={r.id}>
              <time dateTime={r.starts_at}>{sameDay(date, now) ? clock(date) : `${date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }).replace('.', '')}, ${clock(date)}`}</time>
              <div className="today-row-info"><strong>{name}</strong><span>{detail(r)}</span></div>
              <div className="today-row-actions">
                <button type="button" className="calendar-attendance" disabled={isBusy} aria-label={`Marcar como atendido: ${name}`} onClick={() => void mark(r, 'completed')}><Check size={14} /><span>Atendido</span></button>
                <button type="button" className="calendar-attendance calendar-noshow" disabled={isBusy} aria-label={`Marcar que no vino: ${name}`} onClick={() => void mark(r, 'no_show')}><X size={14} /><span>No vino</span></button>
              </div>
            </li>
          })}
        </ul>
        {pending.length > SHOWN_PENDING && <button type="button" className="link-button today-more" onClick={onSeeAll}>Ver los {pending.length} en Reservas</button>}
      </div>}

      <div className="today-group">
        <h3>Lo que queda de hoy</h3>
        {laterToday.length > 0
          ? <ul className="today-list">
            {laterToday.map(r => <li className="today-row today-row--plain" key={r.id}>
              <time dateTime={r.starts_at}>{clock(new Date(r.starts_at))}</time>
              <div className="today-row-info"><strong>{r.clients?.name ?? 'Cliente'}</strong><span>{detail(r)}</span></div>
            </li>)}
          </ul>
          : <p className="today-empty">{today.length === 0 ? 'Hoy no tenés turnos.' : 'No quedan más turnos por hoy.'}</p>}
      </div>
    </>}
  </section>
}

// Tu enlace: compartirlo es lo que hace que lleguen las reservas solas
export function ShareLinkCard({ name, slug }: { name: string; slug: string }) {
  const url = bookingUrl(slug)
  const inputRef = useRef<HTMLInputElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [qrOpen, setQrOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)

  async function copy() {
    if (await copyText(url)) {
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } else {
      // Sin acceso al portapapeles: el enlace queda seleccionado para copiarlo a mano
      inputRef.current?.select()
      setCopyState('manual')
    }
  }

  async function toggleQr() {
    if (qrOpen) { setQrOpen(false); return }
    setQrOpen(true)
    if (qr) return
    setQrError(null)
    try {
      // La librería se carga recién acá: el resto del panel no la descarga
      const QRCode = await import('qrcode')
      setQr(await QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#0a0a0b', light: '#ffffff' } }))
    } catch {
      setQrError('No pudimos generar el QR. Probá de nuevo.')
    }
  }

  return <section className="agenda-card share-card" aria-labelledby="share-title">
    <h2 id="share-title">Tu enlace de reservas</h2>
    <p>Compartilo donde te escriben tus clientes: Instagram, tu estado de WhatsApp o un mensaje.</p>
    <input ref={inputRef} className="share-url" readOnly value={url} aria-label="Tu enlace de reservas" onFocus={event => event.target.select()} />
    <div className="share-actions">
      <button type="button" className="button button--primary button--small" onClick={() => void copy()}>
        {copyState === 'copied' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar enlace</>}
      </button>
      <a className="button button--secondary button--small" href={`https://wa.me/?text=${encodeURIComponent(`Reservá tu turno en ${name}: ${url}`)}`} target="_blank" rel="noreferrer">
        <MessageCircle size={15} /> Enviar por WhatsApp
      </a>
      <button type="button" className="button button--secondary button--small" aria-expanded={qrOpen} onClick={() => void toggleQr()}>
        <QrCode size={15} /> {qrOpen ? 'Ocultar QR' : 'Ver QR'}
      </button>
    </div>
    <span className="sr-only" aria-live="polite">{copyState === 'copied' ? 'Enlace copiado' : ''}</span>
    {copyState === 'manual' && <p className="form-note share-note" role="status">No pudimos copiarlo solo: ya quedó seleccionado, copialo con Ctrl+C.</p>}
    {qrOpen && <div className="share-qr">
      {qr
        ? <>
          <img src={qr} alt={`Código QR que abre ${url}`} width={168} height={168} />
          <a className="button button--secondary button--small" href={qr} download={`qr-reservas-${slug}.png`}><Download size={15} /> Descargar QR</a>
          <small>Imprimilo y pegalo en el mostrador o en la vidriera.</small>
        </>
        : qrError
          ? <p className="form-error" role="alert">{qrError}</p>
          : <p className="form-note" role="status">Generando el QR…</p>}
    </div>}
  </section>
}
