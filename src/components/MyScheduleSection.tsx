import { useEffect, useRef, useState } from 'react'
import {
  AvailabilityEditor,
  availabilityFromSlots,
  availabilitySlotsFromMap,
  type AvailabilityDay,
  type AvailabilityMap,
} from './AvailabilityEditor'
import { getAvailability, listTimeOff, setAvailability, type TimeOff } from '../lib/db'
import { friendlyError } from '../lib/errorMessages'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Igual que en Equipo: espera después del último cambio antes de guardar.
const SAVE_DELAY_MS = 700

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')

// "Mis horarios" del panel de un profesional con cuenta: edita su disponibilidad y ve (sin poder
// cambiarlos) sus días libres, que carga el dueño.
export function MyScheduleSection({ businessId, resourceId, days }: {
  businessId: string
  resourceId: string
  days: AvailabilityDay[]
}) {
  const [availability, setAvailabilityMap] = useState<AvailabilityMap>(() => availabilityFromSlots(days, new Set()))
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // "Cambios guardados" flota abajo un momento y se va solo (los errores se quedan hasta reintentar)
  useEffect(() => {
    if (saveState !== 'saved') return
    const timer = window.setTimeout(() => setSaveState(current => current === 'saved' ? 'idle' : current), 2500)
    return () => window.clearTimeout(timer)
  }, [saveState])
  const [saveError, setSaveError] = useState<string | null>(null)

  // Los cambios se juntan en `pendingRef` y se guardan en fila (`chainRef`): dos guardados nunca se pisan.
  const pendingRef = useRef<AvailabilityMap | null>(null)
  const timerRef = useRef<number | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const lastFailedRef = useRef<AvailabilityMap | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([getAvailability(businessId, resourceId), listTimeOff(businessId)])
      .then(([slots, daysOff]) => {
        if (!active) return
        setAvailabilityMap(availabilityFromSlots(days, slots))
        setTimeOff(daysOff)
      })
      .catch(() => { if (active) setLoadFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessId, resourceId])

  function flush(): Promise<void> {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const map = pendingRef.current
    if (!map) return chainRef.current
    pendingRef.current = null
    chainRef.current = chainRef.current.then(async () => {
      let error: string | null
      try {
        error = await setAvailability(businessId, resourceId, availabilitySlotsFromMap(map))
      } catch (failure) {
        error = failure instanceof Error ? friendlyError(failure.message) : 'Error inesperado.'
      }
      if (error) {
        lastFailedRef.current = map
        setSaveError(error)
        setSaveState('error')
      } else if (pendingRef.current === null && timerRef.current === null) {
        lastFailedRef.current = null
        setSaveState('saved')
      }
    })
    return chainRef.current
  }

  function scheduleSave(map: AvailabilityMap) {
    pendingRef.current = map
    setSaveState('saving')
    setSaveError(null)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => { void flush() }, SAVE_DELAY_MS)
  }

  // Al salir de la pantalla no se pierde nada de lo pendiente.
  useEffect(() => () => { void flush() }, [])

  function change(map: AvailabilityMap) {
    if (loading || loadFailed) return
    setAvailabilityMap(map)
    scheduleSave(map)
  }

  const statusText = saveState === 'saving' ? 'Guardando…'
    : saveState === 'saved' ? 'Cambios guardados'
    : saveState === 'error' ? `No pudimos guardar: ${saveError}`
    : ''

  return <section className="agenda-card">
    <div className="card-heading"><div><h2>Cuándo atendés</h2><p className="autosave-hint">Los cambios se guardan solos: no hace falta tocar ningún botón.</p></div></div>

    <p
      role="status" aria-live="polite"
      className={`autosave-status ${saveState === 'error' ? 'form-error' : 'form-note'}${statusText ? ' has-text' : ''}`}
    >
      {statusText}
      {saveState === 'error' && lastFailedRef.current && <>
        {' '}<button type="button" className="text-button" onClick={() => lastFailedRef.current && scheduleSave(lastFailedRef.current)}>Reintentar</button>
      </>}
    </p>

    {loading ? <p className="form-note" role="status">Cargando…</p>
      : loadFailed ? <p className="form-error" role="alert">No pudimos cargar tus horarios. Recargá la página para volver a intentar.</p>
      : <AvailabilityEditor days={days} availability={availability} onChange={change} />}

    <p className="eyebrow form-group-label">Días libres</p>
    {!loading && timeOff.length === 0 && <p className="form-note">No tenés días libres cargados.</p>}
    {timeOff.length > 0 && <ul className="timeoff-list">
      {timeOff.map(item => <li key={item.id} className="form-note timeoff-item">
        <strong>{item.starts_on === item.ends_on ? dayLabel(item.starts_on) : `${dayLabel(item.starts_on)} al ${dayLabel(item.ends_on)}`}</strong>
        {item.reason ? ` · ${item.reason}` : ''}
        {item.resource_id === null ? ' · todo el negocio' : ''}
      </li>)}
    </ul>}
  </section>
}
