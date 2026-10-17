import { useEffect, useState } from 'react'
import { CalendarOff, X } from 'lucide-react'
import { createTimeOff, deleteTimeOff, listTimeOff, type Professional, type TimeOff } from '../lib/db'

const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const dayLabel = (key: string) =>
  parseDay(key).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')

function rangeLabel(item: TimeOff) {
  return item.starts_on === item.ends_on
    ? dayLabel(item.starts_on)
    : `${dayLabel(item.starts_on)} → ${dayLabel(item.ends_on)}`
}

export function TimeOffSection({ businessId, professionals }: { businessId: string; professionals: Professional[] }) {
  const [items, setItems] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [reason, setReason] = useState('')
  const [resourceId, setResourceId] = useState('') // '' = todo el negocio
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  async function reload() {
    setItems(await listTimeOff(businessId))
    setLoading(false)
  }
  useEffect(() => { void reload() }, [businessId])

  const nameOf = (id: string | null) =>
    id ? professionals.find(p => p.id === id)?.name ?? 'Profesional' : 'Todo el negocio'

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const { affected, error } = await createTimeOff(businessId, {
      resourceId: resourceId || null,
      startsOn,
      endsOn: endsOn || startsOn,
      reason,
    })
    setBusy(false)
    if (error) { setMessage({ text: error, isError: true }); return }
    setStartsOn('')
    setEndsOn('')
    setReason('')
    await reload()
    setMessage({
      text: affected > 0
        ? `Listo. Ojo: ya había ${affected} ${affected === 1 ? 'turno reservado' : 'turnos reservados'} en esos días y no se cancelan solos. Revisalos en Agenda.`
        : 'Listo: esos días ya no se pueden reservar.',
      isError: false,
    })
  }

  async function remove(item: TimeOff) {
    if (!window.confirm(`¿Volver a habilitar ${rangeLabel(item)}?`)) return
    const error = await deleteTimeOff(item.id)
    if (error) { setMessage({ text: error, isError: true }); return }
    await reload()
    setMessage({ text: 'Esos días vuelven a estar disponibles.', isError: false })
  }

  return <section className="agenda-card">
    <div className="card-heading"><div><p className="eyebrow">Días libres</p><h2>Feriados y vacaciones</h2></div></div>
    <p className="section-description">Los días que marques acá no aparecen en tu enlace de reservas. Sirve para feriados, vacaciones o un día que no atendés.</p>

    <form onSubmit={e => void add(e)} style={{ display: 'grid', gap: 12, margin: '16px 0 20px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="onboarding-field" style={{ flex: '1 1 150px' }}>Desde
          <input type="date" required value={startsOn} onChange={e => { setStartsOn(e.target.value); if (!endsOn || endsOn < e.target.value) setEndsOn(e.target.value) }} />
        </label>
        <label className="onboarding-field" style={{ flex: '1 1 150px' }}>Hasta
          <input type="date" required min={startsOn} value={endsOn} onChange={e => setEndsOn(e.target.value)} />
        </label>
        <label className="onboarding-field" style={{ flex: '1 1 180px' }}>Aplica a
          <select value={resourceId} onChange={e => setResourceId(e.target.value)}>
            <option value="">Todo el negocio</option>
            {professionals.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>Solo {p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="onboarding-field">Motivo <small>(opcional, solo lo ves vos)</small>
        <input value={reason} maxLength={80} placeholder="Feriado, vacaciones…" onChange={e => setReason(e.target.value)} />
      </label>
      <div><button type="submit" className="button button--primary" disabled={busy || !startsOn}>{busy ? 'Guardando…' : 'Bloquear días'}</button></div>
    </form>

    {message && <p className={message.isError ? 'form-error' : 'form-note'} role={message.isError ? 'alert' : 'status'}>{message.text}</p>}

    <p className="eyebrow" style={{ marginTop: 16 }}>Próximos días libres</p>
    {loading
      ? <p className="form-note" role="status">Cargando…</p>
      : items.length === 0
        ? <p className="form-note">Todavía no marcaste ningún día libre.</p>
        : <div className="agenda-list">{items.map(item => <div className="reservation-row" key={item.id} style={{ gridTemplateColumns: '24px 1fr auto 28px' }}>
          <CalendarOff size={16} />
          <span className="reservation-info"><strong>{rangeLabel(item)}</strong><small>{nameOf(item.resource_id)}{item.reason ? ` · ${item.reason}` : ''}</small></span>
          <span />
          <button type="button" aria-label={`Quitar ${rangeLabel(item)}`} title="Quitar" onClick={() => void remove(item)}><X size={16} /></button>
        </div>)}</div>}
  </section>
}
