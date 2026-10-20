import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { SegmentIndicator } from './SegmentIndicator'
import { CalendarX, Check, RotateCcw, Search, X } from 'lucide-react'
import { priceLabel } from '../data/demo'
import {
  listAllReservations, updateReservationStatus,
  type HistoryReservation, type Professional, type Reservation,
} from '../lib/db'

type Period = 'upcoming' | 'past' | 'all'
type StatusFilter = 'active' | 'unmarked' | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'all'
export type ReservationsPreset = 'unmarked'

// Los filtros de período y estado se recuerdan mientras dure la pestaña: volver a Reservas no los reinicia
const FILTERS_KEY = 'reser-reservas-filtros'
function readFilters(): { period: Period; status: StatusFilter } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? 'null')
    return saved && typeof saved.period === 'string' && typeof saved.status === 'string' ? saved : null
  } catch { return null }
}
type Tone = 'ok' | 'wait' | 'bad' | 'muted' | 'plain'

const PAGE = 50

// Sin tildes y en minúsculas: "lucia" encuentra "Lucía"
const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function statusInfo(r: HistoryReservation, now: number): { label: string; tone: Tone } {
  if (r.status === 'cancelled') {
    return {
      label: r.cancelled_by === 'client' ? 'Canceló el cliente' : r.cancelled_by === 'owner' ? 'Cancelado por el negocio' : 'Cancelado',
      tone: 'muted',
    }
  }
  if (r.status === 'completed') return { label: 'Atendido', tone: 'ok' }
  if (r.status === 'no_show') return { label: 'No vino', tone: 'bad' }
  return new Date(r.starts_at).getTime() < now ? { label: 'Sin marcar', tone: 'wait' } : { label: 'Confirmado', tone: 'plain' }
}

export function ReservationsSection({ businessId, professionals, reloadKey, onCancel, onStatusChanged, preset }: {
  businessId: string
  preset?: ReservationsPreset | null // "Ver los N en Reservas" del Resumen: abre directo en los turnos pasados sin marcar
  professionals: Professional[]
  reloadKey: number // cambia cuando se carga una reserva nueva a mano: se vuelve a traer todo
  onCancel: (reservation: Reservation) => Promise<boolean>
  onStatusChanged: (id: string, status: 'confirmed' | 'completed' | 'no_show') => void
}) {
  const [all, setAll] = useState<HistoryReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<Period>(() => preset === 'unmarked' ? 'past' : readFilters()?.period ?? 'upcoming')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => preset === 'unmarked' ? 'unmarked' : readFilters()?.status ?? 'active')
  useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ period, status: statusFilter })) } catch { /* sin almacenamiento: los filtros no se recuerdan */ }
  }, [period, statusFilter])
  const [professionalId, setProfessionalId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  const periodGroup = useId()

  // Si ya están los datos de este negocio (por ejemplo, llegó una reserva nueva), se actualiza sin mostrar "Cargando…"
  const loadedForRef = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    if (loadedForRef.current !== businessId) setLoading(true)
    listAllReservations(businessId).then(result => {
      if (!active) return
      setAll(result.reservations)
      setError(result.error)
      setNow(Date.now())
      setLoading(false)
      loadedForRef.current = result.error ? null : businessId
    })
    return () => { active = false }
  }, [businessId, reloadKey, retry])

  // Cada vez que cambia un filtro se vuelve a empezar desde el primer resultado
  useEffect(() => { setVisible(PAGE) }, [query, period, statusFilter, professionalId, serviceId])

  const services = useMemo(() => {
    const byId = new Map<string, string>()
    all.forEach(r => { if (r.services?.name) byId.set(r.service_id, r.services.name) })
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [all])

  const list = useMemo(() => {
    const q = norm(query.trim())
    return all
      .filter(r => {
        const time = new Date(r.starts_at).getTime()
        if (period === 'upcoming' && time < now) return false
        if (period === 'past' && time >= now) return false
        if (statusFilter === 'unmarked') { if (r.status !== 'confirmed' || time >= now) return false }
        else if (statusFilter === 'active' ? r.status === 'cancelled' : statusFilter !== 'all' && r.status !== statusFilter) return false
        if (professionalId && r.resource_id !== professionalId) return false
        if (serviceId && r.service_id !== serviceId) return false
        if (q) {
          const haystack = norm([r.clients?.name, r.clients?.email, r.services?.name, r.resources?.name].filter(Boolean).join(' '))
          if (!haystack.includes(q)) return false
        }
        return true
      })
      // Próximas: la más cercana primero. Pasadas/todas: la más reciente primero.
      .sort((a, b) => period === 'upcoming'
        ? new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        : new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  }, [all, now, query, period, statusFilter, professionalId, serviceId])

  const filtersChanged = query !== '' || period !== 'upcoming' || statusFilter !== 'active' || professionalId !== '' || serviceId !== ''
  const clearFilters = () => {
    setQuery(''); setPeriod('upcoming'); setStatusFilter('active'); setProfessionalId(''); setServiceId('')
  }

  async function mark(r: HistoryReservation, status: 'confirmed' | 'completed' | 'no_show') {
    setBusyId(r.id)
    setActionError(null)
    const updateError = await updateReservationStatus(r.id, status)
    setBusyId(null)
    if (updateError) { setActionError(`No pudimos actualizar el turno de ${r.clients?.name ?? 'el cliente'}: ${updateError}`); return }
    setAll(current => current.map(item => item.id === r.id ? { ...item, status } : item))
    onStatusChanged(r.id, status)
  }

  async function cancel(r: HistoryReservation) {
    setBusyId(r.id)
    setActionError(null)
    const cancelled = await onCancel(r)
    setBusyId(null)
    if (cancelled) setAll(current => current.map(item => item.id === r.id ? { ...item, status: 'cancelled', cancelled_by: 'owner' } : item))
  }

  if (loading) return <p className="form-note" role="status">Cargando reservas…</p>
  if (error) return <p className="form-error" role="alert">
    No pudimos cargar las reservas: {error} <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Reintentar</button>
  </p>
  if (all.length === 0) {
    return <p className="res-empty">Todavía no hay reservas. Las que lleguen desde tu enlace o agregues manualmente van a aparecer acá.</p>
  }

  const shown = list.slice(0, visible)

  return <div className="res-section">
    <div className="res-filters">
      <label className="res-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search" value={query} placeholder="Buscar por cliente, email, servicio o profesional"
          aria-label="Buscar reservas" onChange={e => setQuery(e.target.value)}
        />
      </label>
      <div className="calendar-mode" role="group" aria-label="Período">
        {([['upcoming', 'Próximas'], ['past', 'Pasadas'], ['all', 'Todas']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'is-active' : ''} onClick={() => setPeriod(value)}>{period === value && <SegmentIndicator group={periodGroup} />}{label}</button>)}
      </div>
      <div className="res-selects">
        <label>Estado
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="active">Activos</option>
            <option value="unmarked">Sin marcar</option>
            <option value="confirmed">Confirmados</option>
            <option value="completed">Atendidos</option>
            <option value="no_show">No vino</option>
            <option value="cancelled">Cancelados</option>
            <option value="all">Todos</option>
          </select>
        </label>
        {professionals.length > 1 && <label>Profesional
          <select value={professionalId} onChange={e => setProfessionalId(e.target.value)}>
            <option value="">Todos</option>
            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>}
        {services.length > 1 && <label>Servicio
          <select value={serviceId} onChange={e => setServiceId(e.target.value)}>
            <option value="">Todos</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>}
        {filtersChanged && <button type="button" className="text-button" onClick={clearFilters}>Limpiar filtros</button>}
      </div>
    </div>

    <p className="res-count" role="status">{list.length} {list.length === 1 ? 'reserva' : 'reservas'}</p>
    {actionError && <p className="form-error" role="alert">{actionError}</p>}

    {list.length === 0
      ? <p className="res-empty">
        No hay reservas con esos filtros.{filtersChanged && <> <button type="button" className="text-button" onClick={clearFilters}>Ver todas</button></>}
      </p>
      : <div className="res-list">
        {shown.map(r => {
          const info = statusInfo(r, now)
          const isPast = new Date(r.starts_at).getTime() < now
          const busy = busyId === r.id
          const name = r.clients?.name ?? 'Cliente'
          return <article className="res-row" key={r.id}>
            <time dateTime={r.starts_at}><strong>{dateLabel(r.starts_at)}</strong><span>{timeLabel(r.starts_at)}</span></time>
            <div className="res-info">
              <strong>{name}</strong>
              <small>{r.clients?.email ?? 'Sin email'}</small>
              <small>{r.services?.name ?? 'Servicio'}{professionals.length > 1 && r.resources ? ` · con ${r.resources.name}` : ''}{r.services ? ` · ${priceLabel(Number(r.services.price), r.services.price_mode ?? 'fixed')}` : ''}</small>
            </div>
            <span className={`res-status res-status--${info.tone}`}>{info.label}</span>
            <div className="res-actions">
              {r.status === 'confirmed' && isPast && <>
                <button type="button" disabled={busy} onClick={() => void mark(r, 'completed')}><Check size={13} /> Atendido</button>
                <button type="button" disabled={busy} onClick={() => void mark(r, 'no_show')}><X size={13} /> No vino</button>
              </>}
              {r.status === 'confirmed' && !isPast && <button type="button" disabled={busy} className="res-danger" onClick={() => void cancel(r)}><CalendarX size={13} /> Cancelar turno</button>}
              {(r.status === 'completed' || r.status === 'no_show') && <button type="button" disabled={busy} onClick={() => void mark(r, 'confirmed')}><RotateCcw size={13} /> Deshacer</button>}
            </div>
          </article>
        })}
      </div>}

    {list.length > shown.length && <div className="res-more">
      <button type="button" className="button button--secondary button--small" onClick={() => setVisible(v => v + PAGE)}>
        Ver más ({list.length - shown.length} restantes)
      </button>
    </div>}
  </div>
}
