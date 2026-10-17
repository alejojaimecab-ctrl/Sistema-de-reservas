import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  AvailabilityEditor,
  availabilityFromSlots,
  availabilitySlotsFromMap,
  type AvailabilityDay,
  type AvailabilityMap,
} from './AvailabilityEditor'
import {
  createProfessional, getAvailability, listResourceServices, listServices, setAvailability,
  setProfessionalServices, updateProfessional, type Professional, type Service,
} from '../lib/db'

// Lo que se guarda de un profesional: nombre, horarios y servicios que ofrece.
type Draft = { id: string; name: string; availability: AvailabilityMap; offered: Set<string> }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Espera después del último cambio antes de guardar (junta varios clics en un solo guardado).
const SAVE_DELAY_MS = 700

export function TeamSection({ businessId, days, professionals, onChanged }: {
  businessId: string
  days: AvailabilityDay[]
  professionals: Professional[]
  onChanged: () => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = professionals.find(p => p.id === selectedId) ?? professionals[0] ?? null
  const selectedKey = selected?.id ?? null
  const [newName, setNewName] = useState('')
  const [name, setName] = useState('')
  const [availability, setAvailabilityMap] = useState<AvailabilityMap>(() => availabilityFromSlots(days, new Set()))
  const [services, setServices] = useState<Service[]>([])
  const [offered, setOffered] = useState<Set<string>>(new Set())
  const [copyFrom, setCopyFrom] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeCount = professionals.filter(p => p.is_active).length

  // Guardado automático: los cambios se juntan en `draftRef`, se guardan tras una pausa y
  // siempre en fila (`chainRef`), así dos guardados nunca se pisan entre sí.
  const draftRef = useRef<Draft | null>(null)
  const timerRef = useRef<number | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const lastFailedRef = useRef<Draft | null>(null)
  const professionalsRef = useRef(professionals)
  professionalsRef.current = professionals
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  async function persist(draft: Draft): Promise<string | null> {
    const current = professionalsRef.current.find(p => p.id === draft.id)
    const trimmed = draft.name.trim()
    let renamed = false
    let nameProblem: string | null = null
    if (current && trimmed !== current.name) {
      if (!trimmed) {
        nameProblem = 'El nombre no puede quedar vacío.'
      } else {
        const renameError = await updateProfessional(draft.id, { name: trimmed })
        if (renameError) return renameError
        renamed = true
      }
    }
    const availabilityError = await setAvailability(businessId, draft.id, availabilitySlotsFromMap(draft.availability))
    if (availabilityError) return availabilityError
    const servicesError = await setProfessionalServices(businessId, draft.id, [...draft.offered])
    if (servicesError) return servicesError
    if (renamed) await onChangedRef.current()
    return nameProblem
  }

  // Guarda ya lo pendiente (si hay) y espera a que termine todo lo que está en fila.
  function flush(): Promise<void> {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const draft = draftRef.current
    if (!draft) return chainRef.current
    draftRef.current = null
    chainRef.current = chainRef.current.then(async () => {
      let error: string | null
      try {
        error = await persist(draft)
      } catch (failure) {
        error = failure instanceof Error ? failure.message : 'Error inesperado.'
      }
      if (error) {
        lastFailedRef.current = draft
        setSaveError(error)
        setSaveState('error')
      } else if (draftRef.current === null && timerRef.current === null) {
        lastFailedRef.current = null
        setSaveState('saved')
      }
    })
    return chainRef.current
  }

  function scheduleSave(draft: Draft) {
    draftRef.current = draft
    setSaveState('saving')
    setSaveError(null)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => { void flush() }, SAVE_DELAY_MS)
  }

  // Al salir de la pantalla no se pierde nada de lo pendiente.
  useEffect(() => () => { void flush() }, [])

  useEffect(() => {
    if (!selected) return
    let active = true
    setName(selected.name)
    setMessage(null)
    setLoading(true)
    setLoadFailed(false)
    // Primero termina cualquier guardado en curso, para leer lo último que quedó en la base.
    chainRef.current
      .then(() => Promise.all([
        getAvailability(businessId, selected.id),
        listServices(businessId),
        listResourceServices(businessId),
      ]))
      .then(([slots, allServices, pairs]) => {
        if (!active) return
        setAvailabilityMap(availabilityFromSlots(days, slots))
        setServices(allServices.filter(service => service.is_active))
        setOffered(new Set(pairs.filter(pair => pair.resource_id === selected.id).map(pair => pair.service_id)))
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setMessage('No pudimos cargar los datos. Recargá la página para volver a intentar.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessId, selectedKey])

  // Cualquier cambio del profesional abierto pasa por acá y se guarda solo.
  function edit(patch: Partial<Omit<Draft, 'id'>>) {
    if (!selected || loading || loadFailed) return
    const base: Draft = draftRef.current?.id === selected.id
      ? draftRef.current
      : { id: selected.id, name, availability, offered }
    const next: Draft = { ...base, ...patch }
    setName(next.name)
    setAvailabilityMap(next.availability)
    setOffered(next.offered)
    scheduleSave(next)
  }

  function toggleService(serviceId: string) {
    const next = new Set(offered)
    if (!next.delete(serviceId)) next.add(serviceId)
    edit({ offered: next })
  }

  async function selectProfessional(id: string) {
    if (id === selected?.id) return
    await flush()
    setCopyFrom('')
    setSaveState('idle')
    setSaveError(null)
    setSelectedId(id)
  }

  async function copyHoursFrom(otherId: string) {
    setCopyFrom(otherId)
    if (!otherId) return
    const other = professionals.find(p => p.id === otherId)
    setMessage(null)
    try {
      const slots = await getAvailability(businessId, otherId)
      edit({ availability: availabilityFromSlots(days, slots) })
      setMessage(`Horarios copiados de ${other?.name ?? 'otro profesional'}.`)
    } catch {
      setMessage('No pudimos copiar los horarios. Probá de nuevo.')
    }
  }

  async function add() {
    setBusy(true)
    setMessage(null)
    await flush()
    const { id, error } = await createProfessional(businessId, newName)
    if (error || !id) { setBusy(false); setMessage(error); return }
    // Arranca con los mismos horarios del profesional que se estaba viendo; después se ajustan.
    const copyError = selected
      ? await setAvailability(businessId, id, await getAvailability(businessId, selected.id))
      : null
    await onChanged()
    setBusy(false)
    setNewName('')
    setCopyFrom('')
    setSaveState('idle')
    setSelectedId(id)
    if (copyError) setMessage(`Se creó el profesional, pero no pudimos copiar los horarios: ${copyError}`)
  }

  async function toggleActive() {
    if (!selected) return
    if (selected.is_active && activeCount <= 1) {
      setMessage('Tiene que quedar al menos un profesional activo.')
      return
    }
    setBusy(true)
    setMessage(null)
    await flush()
    const error = await updateProfessional(selected.id, { is_active: !selected.is_active })
    if (!error) await onChanged()
    setBusy(false)
    setMessage(error)
  }

  const statusText = saveState === 'saving' ? 'Guardando…'
    : saveState === 'saved' ? 'Cambios guardados ✓'
    : saveState === 'error' ? `No pudimos guardar: ${saveError}`
    : ''

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Equipo</p><h2>Profesionales y horarios</h2></div></div>
    <p className="section-description">
      {activeCount > 1
        ? 'Tus clientes pueden elegir con quién reservar, o dejar que RESER asigne al primero libre.'
        : 'Si trabajan varias personas, sumalas acá: cada una tiene su propia agenda y sus horarios.'}
      {' '}Los cambios se guardan solos.
    </p>

    <div className="calendar-mode" role="group" aria-label="Profesionales" style={{ flexWrap: 'wrap', height: 'auto', margin: '12px 0 16px' }}>
      {professionals.map(p => <button
        type="button" key={p.id} aria-pressed={selected?.id === p.id}
        className={selected?.id === p.id ? 'is-active' : ''}
        onClick={() => void selectProfessional(p.id)}
      >{p.name}{p.is_active ? '' : ' (inactivo)'}</button>)}
    </div>

    {selected && <>
      <p
        role="status" aria-live="polite"
        className={saveState === 'error' ? 'form-error' : 'form-note'}
        style={{ position: 'sticky', top: 8, zIndex: 5, minHeight: 18, margin: '0 0 8px', padding: statusText ? '6px 10px' : 0, borderRadius: 8, background: statusText ? '#0f1b22' : 'transparent', border: statusText ? '1px solid #28414c' : 0 }}
      >
        {statusText}
        {saveState === 'error' && lastFailedRef.current && <>
          {' '}<button type="button" className="text-button" onClick={() => lastFailedRef.current && scheduleSave(lastFailedRef.current)}>Reintentar</button>
        </>}
      </p>

      <label className="onboarding-field">Nombre
        <input value={name} disabled={loading || loadFailed} onChange={e => edit({ name: e.target.value })} />
      </label>
      <p className="eyebrow" style={{ marginTop: 20 }}>Servicios que ofrece {selected.name}</p>
      {services.length === 0
        ? <p className="form-note">Primero cargá tus servicios en la sección Servicios.</p>
        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', margin: '8px 0 4px' }}>
          {services.map(service => <label key={service.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" disabled={loading || loadFailed} checked={offered.has(service.id)} onChange={() => toggleService(service.id)} />
            {service.name}
          </label>)}
        </div>}
      {offered.size === 0 && services.length > 0 && !loading && <p className="form-note">Sin servicios asignados, nadie va a poder reservar con {selected.name}.</p>}
      <p className="eyebrow" style={{ marginTop: 20 }}>Horarios de {selected.name}</p>
      {professionals.length > 1 && <label className="onboarding-field" style={{ marginBottom: 8 }}>Copiar los horarios de
        <select value={copyFrom} disabled={loading || loadFailed} onChange={e => void copyHoursFrom(e.target.value)}>
          <option value="">Elegí un profesional…</option>
          {professionals.filter(p => p.id !== selected.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>}
      {loading && <p className="form-note" role="status">Cargando…</p>}
      <AvailabilityEditor days={days} availability={availability} onChange={map => { setCopyFrom(''); edit({ availability: map }) }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void toggleActive()}>
          {selected.is_active ? 'Desactivar profesional' : 'Reactivar profesional'}
        </button>
      </div>
    </>}

    <p className="eyebrow" style={{ marginTop: 28 }}>Sumar un profesional</p>
    <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); void add() }}>
      <label className="onboarding-field" style={{ flex: '1 1 220px', margin: 0 }}>
        <input aria-label="Nombre del nuevo profesional" placeholder="Nombre" value={newName} onChange={e => setNewName(e.target.value)} />
      </label>
      <button type="submit" className="button button--secondary" disabled={busy || !newName.trim()}><Plus size={16} /> Agregar</button>
    </form>
    {selected && <p className="form-note">El nuevo profesional empieza con los mismos horarios de {selected.name}; después los ajustás.</p>}
    {message && <p className="form-note" role="status">{message}</p>}
  </section>
}
