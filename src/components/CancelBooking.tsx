import { useEffect, useState } from 'react'
import { CalendarX2, Check } from 'lucide-react'
import { cancelReservationByToken, getReservationByToken, type ReservationByToken } from '../lib/db'

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function CancelBooking({ token, onBack }: { token: string; onBack: () => void }) {
  const [reservation, setReservation] = useState<ReservationByToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    let active = true
    getReservationByToken(token).then(result => {
      if (!active) return
      setReservation(result.reservation)
      setLoadError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [token])

  async function confirmCancel() {
    setBusy(true)
    setError(null)
    const cancelError = await cancelReservationByToken(token)
    setBusy(false)
    if (cancelError) { setError(cancelError); return }
    setCancelled(true)
  }

  const shell = (children: React.ReactNode) => <section className="booking-shell booking-shell--success">
    <div className="booking-success">{children}</div>
  </section>

  if (loading) return shell(<p className="eyebrow">Cargando…</p>)

  if (loadError || !reservation) return shell(<>
    <p className="eyebrow">Cancelar turno</p><h1>No encontramos esa reserva.</h1>
    <p className="success-copy">{loadError ?? 'Revisá que el enlace esté completo.'}</p>
    <button className="button button--secondary" onClick={onBack}>Ir a RESER</button>
  </>)

  const summary = <div className="booking-receipt">
    <span>{reservation.service_name}</span><strong>{dateLabel(reservation.starts_at)}</strong>
    <span>{timeLabel(reservation.starts_at)}</span><span>Con {reservation.professional_name}</span>
  </div>

  if (cancelled || reservation.status === 'cancelled') return shell(<>
    <span className="success-icon"><Check size={34} strokeWidth={2.5} /></span>
    <p className="eyebrow">Turno cancelado</p><h1>Tu turno quedó cancelado.</h1>
    <p className="success-copy">El horario con {reservation.business_name} quedó libre para otra persona.</p>
    {summary}
    <button className="button button--secondary" onClick={onBack}>Ir a RESER</button>
  </>)

  if (reservation.status === 'completed' || new Date(reservation.starts_at).getTime() <= Date.now()) return shell(<>
    <p className="eyebrow">Cancelar turno</p><h1>Este turno ya pasó.</h1>
    <p className="success-copy">Ya no se puede cancelar un turno que se atendió o que ya empezó.</p>
    {summary}
  </>)

  if (!reservation.can_cancel) return shell(<>
    <p className="eyebrow">Cancelar turno</p><h1>Ya no se puede cancelar online.</h1>
    <p className="success-copy">{reservation.business_name} permite cancelar hasta {reservation.cancel_min_hours} hs antes del turno. Comunicate directamente con el negocio.</p>
    {summary}
  </>)

  return shell(<>
    <span className="success-icon"><CalendarX2 size={30} strokeWidth={2.2} /></span>
    <p className="eyebrow">{reservation.business_name}</p><h1>¿Querés cancelar tu turno?</h1>
    <p className="success-copy">Si cancelás, el horario queda libre para otra persona.</p>
    {summary}
    {error && <p className="form-note" role="alert">{error}</p>}
    <button className="button button--primary" disabled={busy} onClick={() => void confirmCancel()}>{busy ? 'Cancelando…' : 'Sí, cancelar mi turno'}</button>
    <button className="button button--secondary" disabled={busy} onClick={onBack}>No, mantenerlo</button>
  </>)
}
