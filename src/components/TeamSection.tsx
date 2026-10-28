import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, Plus, Trash2, UsersRound } from 'lucide-react'
import { SegmentIndicator } from './SegmentIndicator'
import { PlanNote } from './PlanSection'
import { PLANS, professionalsInPlan } from '../lib/plans'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errorMessages'
import { copyText } from '../lib/clipboard'
import { personName, phone } from '../lib/fieldRules'
import { joinUrl } from '../lib/routes'
import { useConfirm } from './ConfirmDialog'
import { priceLabel } from '../data/demo'
import {
  AvailabilityEditor,
  availabilityFromSlots,
  availabilitySlotsFromMap,
  type AvailabilityDay,
  type AvailabilityMap,
} from './AvailabilityEditor'
import {
  createProfessional, createTeamInvite, deleteProfessional, getAvailability, listResourceServices, listServices, listStaffAccess,
  revokeStaffInvite, setAvailability, setProfessionalServices, updateProfessional,
  type Professional, type Service, type StaffInvite,
} from '../lib/db'

// Lo que se guarda de un profesional: nombre, horarios y servicios que ofrece.
type Draft = { id: string; name: string; whatsapp: string; availability: AvailabilityMap; offered: Set<string> }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Espera después del último cambio antes de guardar (junta varios clics en un solo guardado).
const SAVE_DELAY_MS = 700

// Nombre que pone la base cuando todavía no se sabe quién atiende: en pantalla el campo queda vacío para completar.
const UNNAMED = 'Principal'
const editableName = (name: string) => name === UNNAMED ? '' : name
const shownName = (name: string) => name === UNNAMED ? 'Sin nombre' : name
const nameInText = (name: string) => name === UNNAMED ? 'este profesional' : name

export function TeamSection({ businessId, days, professionals, onChanged, professionalLimit, canInvite, onSeePlans }: {
  businessId: string
  days: AvailabilityDay[]
  professionals: Professional[]
  onChanged: () => Promise<void>
  professionalLimit: number | null // cuántos activos incluye el plan (null = sin límite)
  canInvite: boolean // cuentas para el equipo (desde el Básico)
  onSeePlans: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = professionals.find(p => p.id === selectedId) ?? professionals[0] ?? null
  const selectedKey = selected?.id ?? null
  const [newName, setNewName] = useState('')
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [availability, setAvailabilityMap] = useState<AvailabilityMap>(() => availabilityFromSlots(days, new Set()))
  const [services, setServices] = useState<Service[]>([])
  const [offered, setOffered] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // "Cambios guardados" flota abajo un momento y se va solo (los errores se quedan hasta reintentar)
  useEffect(() => {
    if (saveState !== 'saved') return
    const timer = window.setTimeout(() => setSaveState(current => current === 'saved' ? 'idle' : current), 2500)
    return () => window.clearTimeout(timer)
  }, [saveState])
  const [saveError, setSaveError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const pickerGroup = useId()
  // Profesionales con al menos un servicio (los que se suman con el enlace de equipo llegan sin ninguno)
  const [servedIds, setServedIds] = useState<Set<string> | null>(null)
  const activeCount = professionals.filter(p => p.is_active).length
  // Límite del plan: los que pasan del límite siguen acá pero no reciben turnos (la base hace lo mismo)
  const inPlan = professionalsInPlan(professionals, professionalLimit)
  const atLimit = professionalLimit !== null && activeCount >= professionalLimit
  const limitText = professionalLimit === null ? '' : `Tu plan incluye hasta ${professionalLimit} ${professionalLimit === 1 ? 'profesional' : 'profesionales'}.`
  const offeredServices = services.filter(service => offered.has(service.id))
  const onlyWhatsapp = offeredServices.length > 0 && offeredServices.every(service => service.booking_mode === 'whatsapp')

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
    let changed = false
    let nameProblem: string | null = null
    const changes: { name?: string; whatsapp?: string | null } = {}
    if (current && trimmed !== editableName(current.name)) {
      if (!trimmed) nameProblem = 'El nombre no puede quedar vacío.'
      else changes.name = trimmed
    }
    const number = draft.whatsapp.trim()
    if (current && number !== (current.whatsapp ?? '')) changes.whatsapp = number || null
    if (Object.keys(changes).length > 0) {
      const updateError = await updateProfessional(draft.id, changes)
      if (updateError) return updateError
      changed = true
    }
    const availabilityError = await setAvailability(businessId, draft.id, availabilitySlotsFromMap(draft.availability))
    if (availabilityError) return availabilityError
    const servicesError = await setProfessionalServices(businessId, draft.id, [...draft.offered])
    if (servicesError) return servicesError
    if (changed) await onChangedRef.current()
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
        error = failure instanceof Error ? friendlyError(failure.message) : 'Error inesperado.'
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

  // Quien se une con el enlace de equipo aparece en la lista al volver a esta pestaña, sin recargar.
  useEffect(() => {
    const onFocus = () => { void onChangedRef.current() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (!selected) return
    let active = true
    setName(editableName(selected.name))
    setWhatsapp(selected.whatsapp ?? '')
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
        setServedIds(new Set(pairs.map(pair => pair.resource_id)))
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
      : { id: selected.id, name, whatsapp, availability, offered }
    const next: Draft = { ...base, ...patch }
    setName(next.name)
    setWhatsapp(next.whatsapp)
    setAvailabilityMap(next.availability)
    setOffered(next.offered)
    scheduleSave(next)
  }

  function toggleService(serviceId: string) {
    if (!selected) return
    const next = new Set(offered)
    if (!next.delete(serviceId)) next.add(serviceId)
    edit({ offered: next })
    const id = selected.id
    setServedIds(current => {
      const served = new Set(current)
      if (next.size > 0) served.add(id); else served.delete(id)
      return served
    })
  }

  async function selectProfessional(id: string) {
    if (id === selected?.id) return
    await flush()
    setSaveState('idle')
    setSaveError(null)
    setSelectedId(id)
  }

  async function add() {
    setBusy(true)
    setMessage(null)
    await flush()
    const { id, error } = await createProfessional(businessId, newName)
    if (error || !id) { setBusy(false); setMessage(error); return }
    // Arranca con los mismos horarios del profesional que se estaba viendo; después se ajustan.
    const copyError = selected
      ? await getAvailability(businessId, selected.id).then(slots => setAvailability(businessId, id, slots)).catch(() => 'no pudimos leer los horarios de origen')
      : null
    await onChanged()
    setBusy(false)
    setNewName('')
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

  // Sus reservas pasadas no se borran: siguen en el historial con su nombre (migración 030).
  async function remove() {
    if (!selected) return
    const who = nameInText(selected.name)
    const accepted = await confirm({
      title: `¿Eliminar a ${who}?`,
      message: 'Deja de aparecer en tu equipo y en tu página de reservas, y pierde el acceso al panel si lo tenía. Sus reservas pasadas se conservan en el historial.',
      confirmLabel: 'Sí, eliminar',
      cancelLabel: 'No, conservarlo',
      danger: true,
    })
    if (!accepted) return
    setBusy(true)
    setMessage(null)
    await flush()
    const { archived, error } = await deleteProfessional(selected.id)
    if (!error) {
      await onChanged()
      setSelectedId(null)
      setSaveState('idle')
    }
    setBusy(false)
    setMessage(error ?? (archived ? `Eliminaste a ${who}. Sus reservas pasadas siguen en el historial.` : `Eliminaste a ${who}.`))
  }

  const statusText = saveState === 'saving' ? 'Guardando…'
    : saveState === 'saved' ? 'Cambios guardados'
    : saveState === 'error' ? `No pudimos guardar: ${saveError}`
    : ''

  return <section className="agenda-card">
    <div className="card-heading"><div><h2>Profesionales y horarios</h2><p className="autosave-hint">Los cambios se guardan solos: no hace falta tocar ningún botón.</p></div></div>

    <div className="calendar-mode team-picker" role="group" aria-label="Profesionales">
      {professionals.map(p => <button
        type="button" key={p.id} aria-pressed={selected?.id === p.id}
        className={selected?.id === p.id ? 'is-active' : ''}
        onClick={() => void selectProfessional(p.id)}
      >{selected?.id === p.id && <SegmentIndicator group={pickerGroup} />}{shownName(p.name)}{p.is_active ? '' : ' (inactivo)'}{p.is_active && servedIds && !servedIds.has(p.id) ? ' · sin servicios' : ''}{p.is_active && !inPlan.has(p.id) ? ' · fuera del plan' : ''}</button>)}
    </div>

    {selected && <>
      {selected.is_active && !inPlan.has(selected.id) && <PlanNote onSeePlans={onSeePlans}>
        {limitText} {nameInText(selected.name)} sigue en tu equipo, pero no aparece en tu página ni recibe turnos.
      </PlanNote>}
      <p
        role="status" aria-live="polite"
        className={`autosave-status ${saveState === 'error' ? 'form-error' : 'form-note'}${statusText ? ' has-text' : ''}`}
      >
        {statusText}
        {saveState === 'error' && lastFailedRef.current && <>
          {' '}<button type="button" className="text-button" onClick={() => lastFailedRef.current && scheduleSave(lastFailedRef.current)}>Reintentar</button>
        </>}
      </p>

      <label className="onboarding-field">Nombre
        <input maxLength={60} autoComplete="off" autoCapitalize="words" placeholder="Ej: Juan Pérez" value={name} disabled={loading || loadFailed} onChange={e => edit({ name: personName(e.target.value) })} />
      </label>
      <label className="onboarding-field">WhatsApp <small>(opcional)</small>
        <input type="tel" inputMode="tel" maxLength={40} autoComplete="off" placeholder="11 5555 0000" disabled={loading || loadFailed} value={whatsapp} onChange={e => edit({ whatsapp: phone(e.target.value) })} />
      </label>
      <p className="eyebrow form-group-label">Servicios que ofrece</p>
      {services.length === 0
        ? <p className="form-note">Primero cargá tus servicios en la sección Servicios.</p>
        : <div className="service-chips" role="group" aria-label={`Servicios que ofrece ${selected.name}`}>
          {services.map(service => {
            const on = offered.has(service.id)
            return <button
              type="button" key={service.id} aria-pressed={on}
              className={`service-chip${on ? ' is-on' : ''}`}
              disabled={loading || loadFailed}
              onClick={() => toggleService(service.id)}
            >
              <span className="service-chip-mark" aria-hidden="true">
                <Plus className="service-chip-plus" size={13} strokeWidth={2.4} />
                <Check className="service-chip-check" size={13} strokeWidth={3} />
              </span>
              <span className="service-chip-text">
                <strong>{service.name}</strong>
                <small>
                  {service.booking_mode === 'whatsapp' ? 'Por WhatsApp' : `${service.duration_min} min`}
                  {service.price_mode === 'ask' ? '' : ` · ${priceLabel(Number(service.price), service.price_mode)}`}
                </small>
              </span>
            </button>
          })}
        </div>}
      {offered.size === 0 && services.length > 0 && !loading && <p className="form-note">Sin servicios asignados, nadie va a poder reservar con este profesional.</p>}
      {offeredServices.some(service => service.booking_mode === 'whatsapp') && !whatsapp.trim() && <p className="form-note">Este profesional ofrece servicios por WhatsApp pero no tiene número: se usa el teléfono del negocio (Configuración), si lo cargaste.</p>}
      <p className="eyebrow form-group-label">Horarios</p>
      {loading && <p className="form-note" role="status">Cargando…</p>}
      {onlyWhatsapp
        ? <p className="form-note">Todo lo que ofrece este profesional se coordina por WhatsApp: no hace falta cargar horarios en RESER.</p>
        : <AvailabilityEditor days={days} availability={availability} onChange={map => edit({ availability: map })} />}
      <div className="inline-row">
        <button type="button" className="button button--secondary" disabled={busy || (!selected.is_active && atLimit)} title={!selected.is_active && atLimit ? limitText : undefined} onClick={() => void toggleActive()}>
          {selected.is_active ? 'Desactivar profesional' : 'Reactivar profesional'}
        </button>
        <button type="button" className="button button--secondary team-remove" disabled={busy} onClick={() => void remove()}>
          <Trash2 size={15} /> Eliminar profesional
        </button>
      </div>
    </>}

    {/* Sumar a alguien queda plegado: Equipo se usa sobre todo para editar a los que ya están.
        Las dos formas dicen qué cambia entre una y otra. */}
    <details className="team-add" open={professionals.length <= 1}>
      <summary><Plus size={16} aria-hidden="true" /> Sumar un profesional</summary>
      {atLimit ? <PlanNote onSeePlans={onSeePlans}>{limitText} Para sumar a alguien más, pasate a un plan más alto.</PlanNote>
      : <div className="team-add-options">
        <div className="team-add-option">
          <strong>Que entre con su propia cuenta</strong>
          <p>Le mandás un enlace, crea su cuenta y ve su agenda y sus turnos desde su celular.</p>
          {canInvite ? <TeamInvite businessId={businessId} />
            : <PlanNote onSeePlans={onSeePlans}>Las cuentas para tu equipo son parte del plan {PLANS.basico.name}.</PlanNote>}
        </div>
        <div className="team-add-option">
          <strong>Agregarlo vos, solo con el nombre</strong>
          <p>Aparece en la agenda y en la reserva, pero sus turnos los manejás vos.</p>
          <form className="inline-row is-tight" onSubmit={e => { e.preventDefault(); void add() }}>
            <label className="onboarding-field grow-field is-flush">
              <input aria-label="Nombre del nuevo profesional" maxLength={60} autoComplete="off" autoCapitalize="words" placeholder="Ej: Juan Pérez" value={newName} onChange={e => setNewName(personName(e.target.value))} />
            </label>
            <button type="submit" className="button button--secondary" disabled={busy || !newName.trim()}><Plus size={16} /> Agregar</button>
          </form>
        </div>
      </div>}
    </details>
    {message && <p className="form-note" role="status">{message}</p>}
    {dialog}
  </section>
}

// Enlace de equipo (migración 031): un solo enlace para varias personas. Cada una crea su cuenta y aparece sola
// en la lista de Equipo, sin servicios: el dueño elige qué ofrece cada una.
function TeamInvite({ businessId }: { businessId: string }) {
  const { business } = useAuth()
  const [invite, setInvite] = useState<StaffInvite | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const access = await listStaffAccess(businessId)
    setInvite(access.invites.find(i => i.resource_id === null) ?? null)
    setLoaded(true)
  }
  useEffect(() => { void reload() }, [businessId])

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    const actionError = await action()
    await reload()
    setBusy(false)
    if (actionError) setError(actionError)
  }

  const createLink = () => run(async () => (await createTeamInvite(businessId)).error)
  const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false
  const link = invite && !expired ? joinUrl(invite.token) : null
  // Sin número: WhatsApp deja elegir el contacto o el grupo del equipo
  const whatsappUrl = link
    ? `https://wa.me/?text=${encodeURIComponent(`Sumate al equipo de ${business?.name ?? 'nuestro negocio'} en RESER para ver tu agenda y tus turnos. Creá tu cuenta desde este enlace: ${link}`)}`
    : null

  if (!loaded) return <p className="form-note" role="status">Cargando…</p>
  return <>
    {link ? <>
      <p className="form-note">Enlace de equipo · vence el {new Date(invite!.expires_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</p>
      <InviteLink link={link} whatsappUrl={whatsappUrl} />
      <div className="inline-row is-flush">
        <button type="button" className="text-button" disabled={busy} onClick={() => void createLink()}>Generar un enlace nuevo</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => revokeStaffInvite(invite!.token))}>Anular enlace</button>
      </div>
    </> : <button type="button" className="button button--secondary button--small spaced-top" disabled={busy} onClick={() => void createLink()}>
      <UsersRound size={14} /> {expired ? 'Generar un enlace nuevo' : 'Crear enlace de equipo'}
    </button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>
}

// Enlace con Copiar (y WhatsApp). Si el navegador no deja copiar, queda seleccionado para copiarlo a mano.
function InviteLink({ link, whatsappUrl }: { link: string; whatsappUrl: string | null }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setCopied(false); setCopyFailed(false) }, [link])

  async function copy() {
    setCopyFailed(false)
    if (await copyText(link)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      return
    }
    setCopyFailed(true)
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  return <>
    <div className="inline-row is-tight">
      <label className="onboarding-field grow-field is-flush">
        <input ref={inputRef} readOnly aria-label="Enlace de invitación" value={link} onFocus={e => e.target.select()} />
      </label>
      <button type="button" className="button button--secondary button--small" onClick={() => void copy()}>
        {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
      </button>
      {whatsappUrl && <a className="button button--secondary button--small" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Enviar por WhatsApp</a>}
    </div>
    {copyFailed && <p className="form-note" role="status">Este navegador no nos deja copiar solos: el enlace quedó marcado, copialo con Ctrl+C (en el celular, mantené apretado).</p>}
  </>
}
