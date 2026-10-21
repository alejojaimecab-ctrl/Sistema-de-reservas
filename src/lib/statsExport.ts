import type { StatsReservation } from './db'
import { buildXlsx, excelDate, type Cell, type CellStyle, type Sheet } from './xlsx'
import { comparisonLabel, delta, rangeLabel, STATS_TIME_ZONE, WEEKDAY_LABELS, type ClientsOverview, type GoalProgress, type Occupancy, type Stats, type StatsRange } from './stats'

// Las estadísticas del período en un Excel: un resumen y el detalle en hojas aparte.
// Los valores van como números con formato ($ 195.000, 92%, +18%), así se pueden sumar, filtrar y graficar en Excel.
// Donde no hay dato se deja la celda vacía (nada de rayas sueltas).

const localParts = (iso: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso)).map(part => [part.type, part.value]))
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}
const dateCell = (iso: string): Cell => { const { y, m, d } = localParts(iso); return { value: excelDate(y, m, d), style: 'date' } }
const timeText = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: STATS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const statusText = (r: StatsReservation) => r.status === 'completed' ? 'Atendido'
  : r.status === 'no_show' ? 'No vino'
  : r.status === 'cancelled' ? (r.cancelled_by === 'client' ? 'Canceló el cliente' : 'Cancelado por el negocio')
  : new Date(r.starts_at).getTime() < Date.now() ? 'Sin marcar' : 'Confirmado'

const cell = (value: number | string | null | undefined, style: CellStyle): Cell => value === null || value === undefined ? null : { value, style }
const money = (value: number | null | undefined) => cell(value, 'money')
const percent = (rate: number | null | undefined) => cell(rate === null || rate === undefined ? null : rate / 100, 'pct') // 92 → 92%
const change = (current: number | null, previous: number | null) => { const value = delta(current, previous); return cell(value === null ? null : value / 100, 'delta') }
const points = (current: number | null | undefined, previous: number | null | undefined) =>
  current === null || current === undefined || previous === null || previous === undefined ? null : cell(current - previous, 'points')

export function buildStatsWorkbook(input: {
  businessName: string
  range: StatsRange
  previous: StatsRange
  stats: Stats
  occupancy: Occupancy
  previousOccupancy: Occupancy | null
  goal: GoalProgress | null
  clients: ClientsOverview | null
  reservations: StatsReservation[]
}): Blob {
  const { stats, occupancy, goal, clients, range, previous } = input
  const now = stats.current
  const before = stats.previous
  const best = stats.bestWeekday === null ? null : stats.byWeekday[stats.bestWeekday]
  const busiest = stats.byHour.reduce((top, hour) => hour.turns > top.turns ? hour : top, { hour: -1, turns: 0 })

  // ── Resumen ──
  const summaryRows: Cell[][] = [
    [{ value: `Estadísticas de ${input.businessName}`, style: 'title' }],
    [`Período: ${rangeLabel(range)}`],
    [`Comparado ${comparisonLabel(range.kind).replace('vs. ', 'con ')}: ${rangeLabel(previous)}`],
    [{ value: `Exportado el ${new Date().toLocaleString('es-AR', { timeZone: STATS_TIME_ZONE, dateStyle: 'long', timeStyle: 'short' })}`, style: 'note' }],
    [],
    ['Indicador', 'Este período', 'Período anterior', 'Variación'],
    ['Ganancias (turnos atendidos)', money(now.revenue), money(before.revenue), change(now.revenue, before.revenue)],
    ['Ticket promedio', money(now.averageTicket), money(before.averageTicket), change(now.averageTicket, before.averageTicket)],
    ['Clientes atendidos', now.clientsAttended, before.clientsAttended, change(now.clientsAttended, before.clientsAttended)],
    ['Ocupación de la agenda', percent(occupancy.rate), percent(input.previousOccupancy?.rate), points(occupancy.rate, input.previousOccupancy?.rate)],
    ['Asistencia', percent(now.attendanceRate), percent(before.attendanceRate), points(now.attendanceRate, before.attendanceRate)],
    ['Turnos atendidos', now.attended, before.attended, change(now.attended, before.attended)],
    ['No vinieron', now.noShow, before.noShow, change(now.noShow, before.noShow)],
    ['Sin marcar', now.unmarked, before.unmarked],
    ['Por venir', now.upcoming, before.upcoming],
    ['Cancelados por el cliente', now.cancelledByClient, before.cancelledByClient, change(now.cancelledByClient, before.cancelledByClient)],
    ['Cancelados por el negocio', now.cancelledByOwner, before.cancelledByOwner, change(now.cancelledByOwner, before.cancelledByOwner)],
    [],
    [{ value: 'Clientes y reservas', style: 'section' }],
    ['Clientes nuevos (primera vez)', stats.newClients],
    ['Clientes que volvieron', stats.returningClients],
    ['Reservaron por tu enlace', stats.bySource.link],
    ['Los anotaste vos', stats.bySource.manual],
    ['Anticipación promedio', cell(stats.leadTimeDays, 'days')],
    ['Mejor día de la semana', best?.label ?? null],
    ['Hora más pedida', busiest.turns > 0 ? `${busiest.hour} h` : null],
  ]
  if (goal) summaryRows.push(
    [],
    [{ value: 'Meta del mes', style: 'section' }],
    ['Meta', money(goal.goal)],
    ['Logrado', money(goal.earned)],
    ['Avance', percent(goal.percent)],
    ['Falta', money(goal.remaining)],
  )
  summaryRows.push(
    [],
    [{ value: 'Las ganancias suman solo los turnos marcados "Atendido".', style: 'note' }],
    [{ value: 'Los servicios "Desde" se cuentan por su precio mínimo y los "A consultar" no suman.', style: 'note' }],
    [{ value: 'Ocupación y asistencia comparan en puntos (pts): de 70% a 75% son +5 pts.', style: 'note' }],
  )
  const summary: Sheet = { name: 'Resumen', widths: [34, 18, 18, 14], headers: [5], rows: summaryRows }

  // ── Detalle (cada hoja con su encabezado fijo arriba) ──
  const days: Sheet = {
    name: 'Por día',
    widths: [14, 12, 12, 16],
    headers: [0], freeze: 1, columns: [undefined, undefined, undefined, 'money'],
    rows: [['Fecha', 'Turnos', 'Atendidos', 'Ganancias'], ...stats.daily.map(day => {
      const [y, m, d] = day.dayKey.split('-').map(Number)
      return [{ value: excelDate(y, m, d), style: 'date' }, day.turns, day.attended, day.revenue] as Cell[]
    })],
  }

  const weekdays: Sheet = {
    name: 'Por día de la semana',
    widths: [14, 12, 16],
    headers: [0], freeze: 1, columns: [undefined, undefined, 'money'],
    rows: [['Día', 'Turnos', 'Ganancias'], ...stats.byWeekday.map(day => [day.label, day.turns, day.revenue])],
  }

  const heat: Sheet = {
    name: 'Ocupación por hora',
    widths: [10, ...WEEKDAY_LABELS.map(() => 13)],
    headers: [0], freeze: 1, columns: [undefined, ...WEEKDAY_LABELS.map(() => 'pct' as const)],
    rows: [['Hora', ...WEEKDAY_LABELS], ...occupancy.hours.map(hour => [`${hour} h`, ...occupancy.heat.map(row => {
      const slot = row[hour]
      return slot.open > 0 ? Math.round(Math.min(1, slot.booked / slot.open) * 100) / 100 : slot.booked > 0 ? 'Fuera de horario' : 'Cerrado'
    })])],
  }

  const services: Sheet = {
    name: 'Servicios',
    widths: [30, 12, 16],
    headers: [0], freeze: 1, columns: [undefined, undefined, 'money'],
    rows: [['Servicio', 'Turnos', 'Ganancias'], ...stats.byService.map(item => [item.name, item.turns, item.revenue])],
  }
  const professionals: Sheet = {
    name: 'Profesionales',
    widths: [30, 12, 16],
    headers: [0], freeze: 1, columns: [undefined, undefined, 'money'],
    rows: [['Profesional', 'Turnos', 'Ganancias'], ...stats.byProfessional.map(item => [item.name, item.turns, item.revenue])],
  }

  // Clientes: tres tablas una debajo de la otra, cada una con su subtítulo y su encabezado
  const clientRows: Cell[][] = []
  const clientHeaders: number[] = []
  if (clients) {
    clientRows.push([{ value: 'Para recuperar', style: 'section' }], [{ value: 'Pasaron bastante más de lo que suelen tardar en volver y no tienen turno reservado.', style: 'note' }])
    clientHeaders.push(clientRows.length)
    clientRows.push(['Cliente', 'Email', 'Vuelve cada', 'Sin venir hace', 'Visitas', 'Gastó'])
    for (const c of clients.atRisk) clientRows.push([c.name, c.email, cell(c.everyDays, 'days'), cell(c.daysSince, 'days'), c.visits, money(c.revenue)])
    if (clients.atRisk.length === 0) clientRows.push([{ value: 'Nadie se está alejando.', style: 'note' }])
    clientRows.push([], [{ value: 'Los que más vienen', style: 'section' }])
    clientHeaders.push(clientRows.length)
    clientRows.push(['Cliente', 'Email', 'Visitas', 'Gastó', 'Última visita'])
    for (const c of clients.best) clientRows.push([c.name, c.email, c.visits, money(c.revenue), c.lastVisit ? dateCell(c.lastVisit) : null])
    clientRows.push([], [{ value: 'Los que más faltan', style: 'section' }])
    clientHeaders.push(clientRows.length)
    clientRows.push(['Cliente', 'Email', 'No vino (veces)'])
    for (const c of clients.frequentNoShows) clientRows.push([c.name, c.email, c.noShows])
    if (clients.frequentNoShows.length === 0) clientRows.push([{ value: 'Ningún cliente faltó más de una vez.', style: 'note' }])
  } else {
    clientRows.push([{ value: 'La historia de clientes todavía estaba cargando al exportar.', style: 'note' }])
  }
  const clientsSheet: Sheet = { name: 'Clientes', widths: [30, 32, 14, 16, 10, 16], headers: clientHeaders, rows: clientRows }

  const turns: Sheet = {
    name: 'Turnos',
    widths: [12, 8, 28, 26, 20, 24, 14, 10],
    headers: [0], freeze: 1,
    rows: [['Fecha', 'Hora', 'Cliente', 'Servicio', 'Profesional', 'Estado', 'Precio', 'Origen'],
      ...input.reservations.map(r => [
        dateCell(r.starts_at), timeText(r.starts_at), r.clients?.name ?? '', r.services?.name ?? '', r.resources?.name ?? '', statusText(r),
        r.services?.price_mode === 'ask' ? 'A consultar' : money(Number(r.services?.price ?? 0) || 0),
        r.source === 'manual' ? 'Manual' : 'Enlace',
      ] as Cell[])],
  }

  return buildXlsx([summary, days, weekdays, heat, services, professionals, clientsSheet, turns])
}

export function statsFileName(businessName: string, range: StatsRange, extension: string) {
  const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return `estadisticas-${slug(businessName) || 'negocio'}-${slug(rangeLabel(range))}.${extension}`
}
