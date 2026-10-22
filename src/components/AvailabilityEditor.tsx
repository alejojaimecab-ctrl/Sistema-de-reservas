import { Copy, Plus, X } from 'lucide-react'
import { useConfirm } from './ConfirmDialog'
import { TimeSelect } from './TimeSelect'

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

const startOptions = timeSlots.map(slot => ({ value: slot, label: formatTime(slot) }))
const endOptions = endSlots.map(slot => ({ value: slot, label: formatTime(slot) }))

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
  // Primero, media hora después de la última franja (no a las 00:00); si no entra, el hueco libre más largo
  const after = Math.max(...ranges.map(range => range.end)) + 1
  if (after + 2 <= timeSlots.length) return { start: after, end: Math.min(after + 8, timeSlots.length) }
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

  // Compacto: arriba la semana como botones (tocar abre o cierra el día) y abajo una sola línea por día abierto,
  // con sus franjas en la misma línea. Los días cerrados no ocupan lugar.
  const timeSelect = (day: AvailabilityDay, ranges: TimeRange[], index: number, edge: 'start' | 'end') => {
    const range = ranges[index]
    return <TimeSelect
      label={`${day.name}, franja ${index + 1}, ${edge === 'start' ? 'desde' : 'hasta'}`}
      value={range[edge]}
      options={edge === 'start' ? startOptions : endOptions}
      onChange={value => {
        const nextRanges = [...ranges]
        nextRanges[index] = edge === 'start'
          ? { start: value, end: Math.max(value + 1, range.end) }
          : { start: Math.min(range.start, value - 1), end: value }
        setDayRanges(day.id, nextRanges)
      }}
    />
  }

  const renderEditor = () => (
    <div className="availability-editor">
      <div className="availability-week" role="group" aria-label="Días que atendés">
        {days.map(day => {
          const isOpen = rangesFromSlots(availability[day.id]).length > 0
          return <button
            type="button"
            key={day.id}
            aria-pressed={isOpen}
            aria-label={`${day.name}: ${isOpen ? 'abierto' : 'cerrado'}`}
            onClick={() => setDayRanges(day.id, isOpen ? [] : [{ start: 18, end: 36 }])}
          >
            {day.name.slice(0, 3)}
          </button>
        })}
      </div>

      <div className="availability-presets" aria-label="Plantillas de horario">
        <button type="button" onClick={() => void applyPreset(true, 'Lun a vie · 9 a 18')}>Lun a vie · 9 a 18</button>
        <button type="button" onClick={() => void applyPreset(false, 'Todos los días · 9 a 18')}>Todos · 9 a 18</button>
        <button
          type="button"
          disabled={rangesFromSlots(availability[days[0]?.id]).length === 0}
          onClick={() => void copyFirstDayToWeekdays()}
        >
          <Copy size={13} /> Copiar lunes a días hábiles
        </button>
      </div>

      {openDayCount === 0
        ? <p className="availability-empty">Tocá arriba los días que atendés.</p>
        : <div className="availability-days">
          {days.map(day => {
            const ranges = rangesFromSlots(availability[day.id])
            if (ranges.length === 0) return null
            return <div className="availability-row" key={day.id}>
              <span className="availability-row-day">{day.name.slice(0, 3)}</span>
              <div className="availability-ranges">
                {ranges.map((_, index) => <div className="availability-range" key={`${day.id}-${index}`}>
                  {timeSelect(day, ranges, index, 'start')}
                  <span aria-hidden="true">–</span>
                  {timeSelect(day, ranges, index, 'end')}
                  {/* Con una sola franja el lugar de la X queda vacío, así los horarios no se corren del centro */}
                  {ranges.length > 1 ? <button
                    type="button"
                    className="availability-remove"
                    aria-label={`Quitar franja ${index + 1} de ${day.name}`}
                    onClick={() => setDayRanges(day.id, ranges.filter((_, rangeIndex) => rangeIndex !== index))}
                  >
                    <X size={14} />
                  </button> : <span className="availability-remove" aria-hidden="true" />}
                </div>)}
              </div>
              {ranges.length < 3 && <button
                type="button"
                className="availability-add"
                aria-label={`Agregar otra franja el ${day.name.toLowerCase()}`}
                title="Agregar otra franja (por ejemplo, después del almuerzo)"
                disabled={!findAdditionalRange(ranges)}
                onClick={() => {
                  const nextRange = findAdditionalRange(ranges)
                  if (nextRange) setDayRanges(day.id, [...ranges, nextRange])
                }}
              >
                <Plus size={15} />
              </button>}
            </div>
          })}
        </div>}

      <p className="availability-summary" aria-live="polite">
        {openDayCount === 0
          ? 'Todavía no hay días ni horarios habilitados.'
          : `${openDayCount} ${openDayCount === 1 ? 'día abierto' : 'días abiertos'} · ${openHours} ${openHalfHourCount === 2 ? 'hora disponible' : 'horas disponibles'} por semana`}
      </p>
    </div>
  )
  return <>{renderEditor()}{dialog}</>
}
