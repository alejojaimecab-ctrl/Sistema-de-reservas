import { Copy, Plus, X } from 'lucide-react'

export type AvailabilityDay = { id: string; name: string }
export type AvailabilityMap = Record<string, boolean[]>

type TimeRange = { start: number; end: number }

type AvailabilityEditorProps = {
  days: AvailabilityDay[]
  availability: AvailabilityMap
  onChange: (availability: AvailabilityMap) => void
}

const hours = Array.from({ length: 24 }, (_, hour) => hour)
const endHours = Array.from({ length: 24 }, (_, hour) => hour + 1)

function rangesFromHours(dayHours: boolean[] = []): TimeRange[] {
  const ranges: TimeRange[] = []
  let start: number | null = null

  for (let hour = 0; hour <= 24; hour += 1) {
    if (dayHours[hour] && start === null) start = hour
    if (!dayHours[hour] && start !== null) {
      ranges.push({ start, end: hour })
      start = null
    }
  }

  return ranges
}

function hoursFromRanges(ranges: TimeRange[]): boolean[] {
  const dayHours = Array.from({ length: 24 }, () => false)
  ranges.forEach(({ start, end }) => {
    for (let hour = Math.max(0, start); hour < Math.min(24, end); hour += 1) {
      dayHours[hour] = true
    }
  })
  return dayHours
}

export function availabilityFromSlots(days: AvailabilityDay[], slots: Set<string>): AvailabilityMap {
  return Object.fromEntries(days.map(day => [
    day.id,
    hours.map(hour => slots.has(`${day.id}-${hour}`)),
  ]))
}

export function availabilitySlotsFromMap(availability: AvailabilityMap): Set<string> {
  return new Set(Object.entries(availability).flatMap(([day, dayHours]) =>
    dayHours.flatMap((open, hour) => open ? [`${day}-${hour}`] : [])
  ))
}

function defaultAvailability(days: AvailabilityDay[], weekdaysOnly: boolean): AvailabilityMap {
  return Object.fromEntries(days.map((day, index) => [
    day.id,
    hours.map(hour => (weekdaysOnly ? index < 5 : true) && hour >= 9 && hour < 18),
  ]))
}

function findAdditionalRange(ranges: TimeRange[]): TimeRange | null {
  const available = hours.map(hour => !ranges.some(range => hour >= range.start && hour < range.end))
  for (let start = 14; start < 24; start += 1) {
    const end = Math.min(start + 4, 24)
    const separated = ranges.every(range => end < range.start || start > range.end)
    if (end - start >= 2 && separated && available.slice(start, end).every(Boolean)) return { start, end }
  }
  for (let start = 9; start < 14; start += 1) {
    const end = Math.min(start + 4, 24)
    const separated = ranges.every(range => end < range.start || start > range.end)
    if (end - start >= 2 && separated && available.slice(start, end).every(Boolean)) return { start, end }
  }
  return null
}

export function AvailabilityEditor({ days, availability, onChange }: AvailabilityEditorProps) {
  function setDayRanges(dayId: string, ranges: TimeRange[]) {
    onChange({ ...availability, [dayId]: hoursFromRanges(ranges) })
  }

  function copyFirstDayToWeekdays() {
    const sourceRanges = rangesFromHours(availability[days[0]?.id])
    if (sourceRanges.length === 0) return

    const next = { ...availability }
    days.slice(1, 5).forEach(day => {
      next[day.id] = hoursFromRanges(sourceRanges)
    })
    onChange(next)
  }

  const openDayCount = days.filter(day => rangesFromHours(availability[day.id]).length > 0).length
  const openHourCount = days.reduce((total, day) =>
    total + (availability[day.id] ?? []).filter(Boolean).length, 0)

  const renderEditor = () => (
    <div className="availability-editor">
      <div className="availability-presets" aria-label="Plantillas de horario">
        <button type="button" onClick={() => onChange(defaultAvailability(days, true))}>
          Lun a vie · 9 a 18
        </button>
        <button type="button" onClick={() => onChange(defaultAvailability(days, false))}>
          Todos los días · 9 a 18
        </button>
        <button
          type="button"
          className="availability-copy"
          disabled={rangesFromHours(availability[days[0]?.id]).length === 0}
          onClick={copyFirstDayToWeekdays}
        >
          <Copy size={14} /> Copiar lunes a días hábiles
        </button>
      </div>

      <div className="availability-days">
        {days.map(day => {
          const ranges = rangesFromHours(availability[day.id])
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
                    event.target.checked ? [{ start: 9, end: 18 }] : [],
                  )}
                />
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
                          {hours.map(hour => (
                            <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
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
                          {endHours.map(hour => (
                            <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
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
          : `${openDayCount} ${openDayCount === 1 ? 'día abierto' : 'días abiertos'} · ${openHourCount} ${openHourCount === 1 ? 'hora disponible' : 'horas disponibles'} por semana`}
      </p>
    </div>
  )
  return renderEditor()
}
