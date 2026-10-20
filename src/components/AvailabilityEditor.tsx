import { Check, Copy, Plus, X } from 'lucide-react'
import { useConfirm } from './ConfirmDialog'

export type AvailabilityDay = { id: string; name: string }
export type AvailabilityMap = Record<string, boolean[]>

type TimeRange = { start: number; end: number }

type AvailabilityEditorProps = {
  days: AvailabilityDay[]
  availability: AvailabilityMap
  onChange: (availability: AvailabilityMap) => void
}

const timeSlots = Array.from({ length: 48 }, (_, slot) => slot)
const endSlots = Array.from({ length: 48 }, (_, slot) => slot + 1)

function formatTime(slot: number) {
  const minutes = slot * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function rangesFromSlots(daySlots: boolean[] = []): TimeRange[] {
  const ranges: TimeRange[] = []
  let start: number | null = null

  for (let slot = 0; slot <= 48; slot += 1) {
    if (daySlots[slot] && start === null) start = slot
    if (!daySlots[slot] && start !== null) {
      ranges.push({ start, end: slot })
      start = null
    }
  }

  return ranges
}

function slotsFromRanges(ranges: TimeRange[]): boolean[] {
  const daySlots = Array.from({ length: 48 }, () => false)
  ranges.forEach(({ start, end }) => {
    for (let slot = Math.max(0, start); slot < Math.min(48, end); slot += 1) {
      daySlots[slot] = true
    }
  })
  return daySlots
}

export function availabilityFromSlots(days: AvailabilityDay[], slots: Set<string>): AvailabilityMap {
  return Object.fromEntries(days.map(day => [
    day.id,
    timeSlots.map(slot => slots.has(`${day.id}-${slot}`)),
  ]))
}

export function availabilitySlotsFromMap(availability: AvailabilityMap): Set<string> {
  return new Set(Object.entries(availability).flatMap(([day, dayHours]) =>
    dayHours.flatMap((open, slot) => open ? [`${day}-${slot}`] : [])
  ))
}

function defaultAvailability(days: AvailabilityDay[], weekdaysOnly: boolean): AvailabilityMap {
  return Object.fromEntries(days.map((day, index) => [
    day.id,
    timeSlots.map(slot => (weekdaysOnly ? index < 5 : true) && slot >= 18 && slot < 36),
  ]))
}

function findAdditionalRange(ranges: TimeRange[]): TimeRange | null {
  const occupied = timeSlots.map(slot => ranges.some(range => slot >= range.start && slot < range.end))
  let bestRange: TimeRange | null = null
  let slot = 0

  while (slot < timeSlots.length) {
    if (occupied[slot]) {
      slot += 1
      continue
    }

    const start = slot
    while (slot < timeSlots.length && !occupied[slot]) slot += 1

    const end = Math.min(start + 8, slot)
    if (!bestRange || end - start > bestRange.end - bestRange.start) {
      bestRange = { start, end }
    }
  }

  return bestRange
}

export function AvailabilityEditor({ days, availability, onChange }: AvailabilityEditorProps) {
  const { confirm, dialog } = useConfirm()

  // Una plantilla reemplaza la semana entera: si ya había horarios cargados (y distintos), primero se pregunta
  async function applyPreset(weekdaysOnly: boolean, label: string) {
    const next = defaultAvailability(days, weekdaysOnly)
    const hasSchedule = days.some(day => (availability[day.id] ?? []).some(Boolean))
    const same = days.every(day => timeSlots.every(slot => Boolean(availability[day.id]?.[slot]) === next[day.id][slot]))
    if (same) return
    if (hasSchedule) {
      const accepted = await confirm({
        title: `¿Reemplazar tus horarios por "${label}"?`,
        message: 'Se borran los horarios que ya tenías configurados en todos los días y en su lugar queda la plantilla. Lo que habías armado se pierde.',
        confirmLabel: 'Reemplazar horarios',
        cancelLabel: 'Mantener los míos',
        danger: true,
      })
      if (!accepted) return
    }
    onChange(next)
  }

  function setDayRanges(dayId: string, ranges: TimeRange[]) {
    onChange({ ...availability, [dayId]: slotsFromRanges(ranges) })
  }

  // Igual que las plantillas: si martes a viernes ya tenían horarios distintos, primero se pregunta
  async function copyFirstDayToWeekdays() {
    const sourceRanges = rangesFromSlots(availability[days[0]?.id])
    if (sourceRanges.length === 0) return
    const source = slotsFromRanges(sourceRanges)
    const targets = days.slice(1, 5)
    const differs = (day: AvailabilityDay) => timeSlots.some(slot => Boolean(availability[day.id]?.[slot]) !== source[slot])
    if (!targets.some(differs)) return
    const overwritten = targets.filter(day => (availability[day.id] ?? []).some(Boolean) && differs(day))
    if (overwritten.length > 0) {
      const accepted = await confirm({
        title: `¿Copiar el horario del ${days[0].name.toLowerCase()}?`,
        message: `Se reemplazan los horarios que ya tenías el ${overwritten.map(day => day.name.toLowerCase()).join(', ')}. Lo que habías armado esos días se pierde.`,
        confirmLabel: 'Copiar horario',
        cancelLabel: 'Mantener los míos',
        danger: true,
      })
      if (!accepted) return
    }
    const next = { ...availability }
    targets.forEach(day => { next[day.id] = slotsFromRanges(sourceRanges) })
    onChange(next)
  }

  const openDayCount = days.filter(day => rangesFromSlots(availability[day.id]).length > 0).length
  const openHalfHourCount = days.reduce((total, day) =>
    total + (availability[day.id] ?? []).filter(Boolean).length, 0)
  const openHours = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(openHalfHourCount / 2)

  const renderEditor = () => (
    <div className="availability-editor">
      <div className="availability-presets" aria-label="Plantillas de horario">
        <button type="button" onClick={() => void applyPreset(true, 'Lun a vie · 9 a 18')}>
          Lun a vie · 9 a 18
        </button>
        <button type="button" onClick={() => void applyPreset(false, 'Todos los días · 9 a 18')}>
          Todos los días · 9 a 18
        </button>
        <button
          type="button"
          className="availability-copy"
          disabled={rangesFromSlots(availability[days[0]?.id]).length === 0}
          onClick={() => void copyFirstDayToWeekdays()}
        >
          <Copy size={14} /> Copiar lunes a días hábiles
        </button>
      </div>

      <div className="availability-days">
        {days.map(day => {
          const ranges = rangesFromSlots(availability[day.id])
          const isOpen = ranges.length > 0

          return (
            <section className={`availability-day${isOpen ? ' is-open' : ''}`} key={day.id}>
              <label className="availability-day-toggle">
                <input
                  type="checkbox"
                  checked={isOpen}
                  aria-label={`${isOpen ? 'Cerrar' : 'Abrir'} ${day.name}`}
                  onChange={event => setDayRanges(
                    day.id,
                    event.target.checked ? [{ start: 18, end: 36 }] : [],
                  )}
                />
                <span className="availability-day-check" aria-hidden="true">
                  <Check size={15} strokeWidth={3} />
                </span>
                <span>{day.name}</span>
              </label>

              {isOpen ? (
                <div className="availability-ranges">
                  {ranges.map((range, index) => (
                    <div className="availability-range" key={`${day.id}-${index}`}>
                      <label>
                        <span>Desde</span>
                        <select
                          aria-label={`${day.name}, franja ${index + 1}, desde`}
                          value={range.start}
                          onChange={event => {
                            const start = Number(event.target.value)
                            const nextRanges = [...ranges]
                            nextRanges[index] = { start, end: Math.max(start + 1, range.end) }
                            setDayRanges(day.id, nextRanges)
                          }}
                        >
                          {timeSlots.map(slot => (
                            <option key={slot} value={slot}>{formatTime(slot)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Hasta</span>
                        <select
                          aria-label={`${day.name}, franja ${index + 1}, hasta`}
                          value={range.end}
                          onChange={event => {
                            const end = Number(event.target.value)
                            const nextRanges = [...ranges]
                            nextRanges[index] = { start: Math.min(range.start, end - 1), end }
                            setDayRanges(day.id, nextRanges)
                          }}
                        >
                          {endSlots.map(slot => (
                            <option key={slot} value={slot}>{formatTime(slot)}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="availability-remove"
                        aria-label={`Quitar franja ${index + 1} de ${day.name}`}
                        onClick={() => setDayRanges(day.id, ranges.filter((_, rangeIndex) => rangeIndex !== index))}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  {ranges.length < 3 && (
                    <button
                      type="button"
                      className="availability-add"
                      disabled={!findAdditionalRange(ranges)}
                      onClick={() => {
                        const nextRange = findAdditionalRange(ranges)
                        if (nextRange) setDayRanges(day.id, [...ranges, nextRange])
                      }}
                    >
                      <Plus size={14} /> Agregar otra franja
                    </button>
                  )}
                </div>
              ) : (
                <span className="availability-closed">Cerrado</span>
              )}
            </section>
          )
        })}
      </div>

      <p className="availability-summary" aria-live="polite">
        {openDayCount === 0
          ? 'Todavía no hay días ni horarios habilitados.'
          : `${openDayCount} ${openDayCount === 1 ? 'día abierto' : 'días abiertos'} · ${openHours} ${openHalfHourCount === 2 ? 'hora disponible' : 'horas disponibles'} por semana`}
      </p>
    </div>
  )
  return <>{renderEditor()}{dialog}</>
}
