import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  AvailabilityEditor,
  availabilityFromSlots,
  availabilitySlotsFromMap,
  type AvailabilityDay,
  type AvailabilityMap,
} from './AvailabilityEditor'
import { createProfessional, getAvailability, setAvailability, updateProfessional, type Professional } from '../lib/db'

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
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const activeCount = professionals.filter(p => p.is_active).length

  useEffect(() => {
    if (!selected) return
    let active = true
    setName(selected.name)
    setMessage(null)
    setLoading(true)
    setLoadFailed(false)
    getAvailability(businessId, selected.id)
      .then(slots => { if (active) setAvailabilityMap(availabilityFromSlots(days, slots)) })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setMessage('No pudimos cargar los horarios. Recargá la página para volver a intentar.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessId, selectedKey])

  async function add() {
    setBusy(true)
    setMessage(null)
    const { id, error } = await createProfessional(businessId, newName)
    if (error || !id) { setBusy(false); setMessage(error); return }
    // Arranca con los mismos horarios del profesional que se estaba viendo; después se ajustan.
    const copyError = selected
      ? await setAvailability(businessId, id, await getAvailability(businessId, selected.id))
      : null
    await onChanged()
    setBusy(false)
    setNewName('')
    setSelectedId(id)
    if (copyError) setMessage(`Se creó el profesional, pero no pudimos copiar los horarios: ${copyError}`)
  }

  async function save() {
    if (!selected || loading || loadFailed) return
    setBusy(true)
    setMessage(null)
    const nameError = name.trim() !== selected.name ? await updateProfessional(selected.id, { name }) : null
    const error = nameError ?? await setAvailability(businessId, selected.id, availabilitySlotsFromMap(availability))
    if (!error) await onChanged()
    setBusy(false)
    setMessage(error ?? 'Cambios guardados ✓')
  }

  async function toggleActive() {
    if (!selected) return
    if (selected.is_active && activeCount <= 1) {
      setMessage('Tiene que quedar al menos un profesional activo.')
      return
    }
    setBusy(true)
    setMessage(null)
    const error = await updateProfessional(selected.id, { is_active: !selected.is_active })
    if (!error) await onChanged()
    setBusy(false)
    setMessage(error)
  }

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Equipo</p><h2>Profesionales y horarios</h2></div></div>
    <p className="section-description">
      {activeCount > 1
        ? 'Tus clientes pueden elegir con quién reservar, o dejar que RESER asigne al primero libre.'
        : 'Si trabajan varias personas, sumalas acá: cada una tiene su propia agenda y sus horarios.'}
    </p>

    <div className="calendar-mode" role="group" aria-label="Profesionales" style={{ flexWrap: 'wrap', height: 'auto', margin: '12px 0 16px' }}>
      {professionals.map(p => <button
        type="button" key={p.id} aria-pressed={selected?.id === p.id}
        className={selected?.id === p.id ? 'is-active' : ''}
        onClick={() => setSelectedId(p.id)}
      >{p.name}{p.is_active ? '' : ' (inactivo)'}</button>)}
    </div>

    {selected && <>
      <label className="onboarding-field">Nombre
        <input value={name} onChange={e => setName(e.target.value)} />
      </label>
      <p className="eyebrow" style={{ marginTop: 20 }}>Horarios de {selected.name}</p>
      {loading && <p className="form-note" role="status">Cargando horarios…</p>}
      <AvailabilityEditor days={days} availability={availability} onChange={setAvailabilityMap} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" className="button button--primary" disabled={busy || loading || loadFailed} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
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
