import type { StatsReservation } from './db'

// Cálculos de la sección Estadísticas. Sin React ni base de datos: recibe turnos y devuelve números, así más adelante
// se puede pasar a una función de Postgres sin tocar la pantalla. Todo se agrupa en la zona horaria del negocio.

export const STATS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export type RangeKind = 'month' | 'week' | '30d' | '90d' | 'year' | 'custom'

export type StatsRange = {
  kind: RangeKind
  from: Date // incluido
  to: Date // excluido
}

const DAY_MS = 86_400_000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

// El período que se ve: mes, semana (de lunes a domingo), últimos 30/90 días, año o un rango a elección
export function buildRange(kind: RangeKind, anchor: Date, custom?: { from: Date; to: Date }): StatsRange {
  const day = startOfDay(anchor)
  switch (kind) {
    case 'month': return { kind, from: new Date(day.getFullYear(), day.getMonth(), 1), to: new Date(day.getFullYear(), day.getMonth() + 1, 1) }
    case 'week': {
      const monday = addDays(day, -((day.getDay() + 6) % 7))
      return { kind, from: monday, to: addDays(monday, 7) }
    }
    case '30d': return { kind, from: addDays(day, -29), to: addDays(day, 1) }
    case '90d': return { kind, from: addDays(day, -89), to: addDays(day, 1) }
    case 'year': return { kind, from: new Date(day.getFullYear(), 0, 1), to: new Date(day.getFullYear() + 1, 0, 1) }
    case 'custom': {
      const from = startOfDay(custom?.from ?? day)
      const to = addDays(startOfDay(custom?.to ?? day), 1)
      return { kind, from, to: to > from ? to : addDays(from, 1) }
    }
  }
}

// Las flechas: el mes, la semana o el año anterior/siguiente; 30/90 días y el rango libre se corren su propio largo
export function shiftRange(range: StatsRange, direction: -1 | 1): StatsRange {
  const { from } = range
  switch (range.kind) {
    case 'month': return buildRange('month', new Date(from.getFullYear(), from.getMonth() + direction, 1))
    case 'week': return buildRange('week', addDays(from, direction * 7))
    case 'year': return buildRange('year', new Date(from.getFullYear() + direction, 0, 1))
    default: {
      const days = rangeDays(range)
      return { kind: range.kind, from: addDays(from, direction * days), to: addDays(range.to, direction * days) }
    }
  }
}

// Con qué se compara: el período anterior del mismo tipo (el mes pasado, la semana pasada, los 30 días previos…)
export function previousRange(range: StatsRange): StatsRange {
  return shiftRange(range, -1)
}

export function rangeDays(range: StatsRange) {
  return Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / DAY_MS)
}

export function rangeLabel(range: StatsRange): string {
  const { from } = range
  const last = addDays(range.to, -1)
  const short = (date: Date) => date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
  switch (range.kind) {
    case 'month': return from.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())
    case 'year': return String(from.getFullYear())
    default: {
      const sameYear = from.getFullYear() === last.getFullYear()
      return `${short(from)} – ${short(last)}${sameYear ? ` ${last.getFullYear()}` : ''}`.replace(/ de /g, ' ')
    }
  }
}

export function comparisonLabel(kind: RangeKind): string {
  switch (kind) {
    case 'month': return 'vs. el mes anterior'
    case 'week': return 'vs. la semana anterior'
    case 'year': return 'vs. el año anterior'
    case '30d': return 'vs. los 30 días previos'
    case '90d': return 'vs. los 90 días previos'
    case 'custom': return 'vs. el período anterior'
  }
}

// ── Agrupado en la zona del negocio ──────────────────────────────────────────

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
})
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function localParts(iso: string) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(iso)).map(part => [part.type, part.value]))
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0, // 0 = lunes
    hour: Number(parts.hour) % 24,
  }
}

export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// ── Los números ─────────────────────────────────────────────────────────────

export type Ranked = { id: string; name: string; turns: number; revenue: number } // id: puede haber dos con el mismo nombre

export type PeriodTotals = {
  revenue: number // ganancias: solo turnos atendidos
  revenueFromCount: number // atendidos de servicios "Desde $X": se cuentan por el mínimo
  revenueAskCount: number // atendidos de servicios "A consultar": no suman
  attended: number
  noShow: number
  unmarked: number // ya pasaron y no se marcaron: "por confirmar"
  upcoming: number // todavía no llegan
  cancelledByClient: number
  cancelledByOwner: number
  attendanceRate: number | null // atendidos / (atendidos + no vino)
  clientsAttended: number // clientes distintos que vinieron
  averageTicket: number | null // ganancias / turnos atendidos
}

export type Stats = {
  current: PeriodTotals
  previous: PeriodTotals
  newClients: number | null // vinieron por primera vez en el período (null mientras no se sabe)
  returningClients: number | null
  byWeekday: { label: string; turns: number; revenue: number }[]
  bestWeekday: number | null // índice en byWeekday (0 = lunes)
  byHour: { hour: number; turns: number }[]
  byService: Ranked[]
  byProfessional: Ranked[]
  bySource: { link: number; manual: number }
  leadTimeDays: number | null // con cuántos días de anticipación reservan por el enlace, en promedio
  daily: { dayKey: string; turns: number; attended: number; revenue: number }[]
}

const isCancelled = (r: StatsReservation) => r.status === 'cancelled'

function priceOf(r: StatsReservation): { amount: number; mode: 'fixed' | 'from' | 'ask' } {
  const mode = r.services?.price_mode ?? 'fixed'
  return { amount: mode === 'ask' ? 0 : Number(r.services?.price ?? 0) || 0, mode }
}

export function periodTotals(reservations: StatsReservation[], now: number): PeriodTotals {
  let revenue = 0
  let revenueFromCount = 0
  let revenueAskCount = 0
  let attended = 0
  let noShow = 0
  let unmarked = 0
  let upcoming = 0
  let cancelledByClient = 0
  let cancelledByOwner = 0
  const clients = new Set<string>()
  for (const r of reservations) {
    if (r.status === 'cancelled') {
      if (r.cancelled_by === 'client') cancelledByClient += 1
      else cancelledByOwner += 1
    } else if (r.status === 'completed') {
      attended += 1
      if (r.client_id) clients.add(r.client_id)
      const price = priceOf(r)
      revenue += price.amount
      if (price.mode === 'from') revenueFromCount += 1
      if (price.mode === 'ask') revenueAskCount += 1
    } else if (r.status === 'no_show') {
      noShow += 1
    } else if (new Date(r.starts_at).getTime() < now) {
      unmarked += 1
    } else {
      upcoming += 1
    }
  }
  const marked = attended + noShow
  return {
    revenue, revenueFromCount, revenueAskCount, attended, noShow, unmarked, upcoming, cancelledByClient, cancelledByOwner,
    attendanceRate: marked > 0 ? Math.round((attended / marked) * 100) : null,
    clientsAttended: clients.size,
    averageTicket: attended > 0 ? Math.round(revenue / attended) : null,
  }
}

function rank(map: Map<string, Ranked>): Ranked[] {
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.turns - a.turns || a.name.localeCompare(b.name))
}

export function computeStats(
  range: StatsRange,
  current: StatsReservation[],
  previous: StatsReservation[],
  firstVisits: Map<string, string> | null,
  now = Date.now(),
): Stats {
  const kept = current.filter(r => !isCancelled(r))

  const byWeekday = WEEKDAY_LABELS.map(label => ({ label, turns: 0, revenue: 0 }))
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, turns: 0 }))
  const services = new Map<string, Ranked>()
  const professionals = new Map<string, Ranked>()
  const daily = new Map<string, { dayKey: string; turns: number; attended: number; revenue: number }>()
  const bySource = { link: 0, manual: 0 }
  let leadTotal = 0
  let leadCount = 0

  // Todos los días del período, aunque no tengan turnos, para que el gráfico no salte días
  for (let day = new Date(range.from); day < range.to; day = addDays(day, 1)) {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    daily.set(key, { dayKey: key, turns: 0, attended: 0, revenue: 0 })
  }

  for (const r of kept) {
    const { dayKey, weekday, hour } = localParts(r.starts_at)
    const revenue = r.status === 'completed' ? priceOf(r).amount : 0
    byWeekday[weekday].turns += 1
    byWeekday[weekday].revenue += revenue
    byHour[hour].turns += 1
    const dayEntry = daily.get(dayKey)
    if (dayEntry) { dayEntry.turns += 1; dayEntry.revenue += revenue; if (r.status === 'completed') dayEntry.attended += 1 }

    const serviceName = r.services?.name ?? 'Servicio'
    const service = services.get(r.service_id ?? serviceName) ?? { id: r.service_id ?? serviceName, name: serviceName, turns: 0, revenue: 0 }
    service.turns += 1
    service.revenue += revenue
    services.set(r.service_id ?? serviceName, service)

    const professionalName = r.resources?.name ?? 'Sin asignar'
    const professional = professionals.get(r.resource_id ?? professionalName) ?? { id: r.resource_id ?? professionalName, name: professionalName, turns: 0, revenue: 0 }
    professional.turns += 1
    professional.revenue += revenue
    professionals.set(r.resource_id ?? professionalName, professional)

    if (r.source === 'manual') bySource.manual += 1
    else {
      bySource.link += 1
      if (r.created_at) {
        const lead = (new Date(r.starts_at).getTime() - new Date(r.created_at).getTime()) / DAY_MS
        if (lead >= 0) { leadTotal += lead; leadCount += 1 }
      }
    }
  }

  // Mejor día: el que más ganó; si nadie ganó todavía, el que más turnos tuvo
  const bestByRevenue = byWeekday.reduce((best, day, index) => day.revenue > (best === null ? 0 : byWeekday[best].revenue) ? index : best, null as number | null)
  const bestByTurns = byWeekday.reduce((best, day, index) => day.turns > (best === null ? 0 : byWeekday[best].turns) ? index : best, null as number | null)

  // Clientes nuevos: su primer turno en el negocio cae dentro del período
  let newClients: number | null = null
  let returningClients: number | null = null
  if (firstVisits) {
    const attendedClients = new Set(current.filter(r => r.status === 'completed' && r.client_id).map(r => r.client_id as string))
    newClients = 0
    returningClients = 0
    for (const id of attendedClients) {
      const first = firstVisits.get(id)
      if (first && new Date(first) >= range.from) newClients += 1
      else returningClients += 1
    }
  }

  return {
    current: periodTotals(current, now),
    previous: periodTotals(previous, now),
    newClients,
    returningClients,
    byWeekday,
    bestWeekday: bestByRevenue ?? bestByTurns,
    byHour,
    byService: rank(services),
    byProfessional: rank(professionals),
    bySource,
    leadTimeDays: leadCount > 0 ? Math.round((leadTotal / leadCount) * 10) / 10 : null,
    daily: [...daily.values()],
  }
}

// Cambio porcentual contra el período anterior; null si antes no había con qué comparar
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ── Ocupación y mapa de calor ──────────────────────────────────────────────
// Ocupación = minutos reservados / minutos de agenda abierta (los horarios de cada profesional, sin sus días libres).
// En el período en curso se mide hasta hoy: los días que faltan todavía se pueden llenar.

export type HeatCell = { open: number; booked: number } // en minutos
export type Occupancy = {
  rate: number | null // 0–100
  openMinutes: number
  bookedMinutes: number
  measuredUntil: Date // hasta dónde se midió (excluido)
  heat: HeatCell[][] // [día de la semana, 0 = lunes][hora 0–23]
  hours: number[] // las horas que tienen agenda abierta algún día, para dibujar solo esas filas
  quiet: { weekday: number; hour: number; rate: number }[] // las franjas más vacías que se repiten
}

type OpenSlotLike = { resource_id: string; day_of_week: number; slot_index: number }
type TimeOffLike = { resource_id: string | null; starts_on: string; ends_on: string }

const dayKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function computeOccupancy(
  range: StatsRange,
  reservations: StatsReservation[],
  availability: OpenSlotLike[],
  timeOff: TimeOffLike[],
  now = new Date(),
): Occupancy {
  const tomorrow = addDays(startOfDay(now), 1)
  const until = range.to < tomorrow ? range.to : tomorrow
  const heat: HeatCell[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ open: 0, booked: 0 })))

  // Medias horas abiertas por profesional y día de la semana (0 = domingo, como se guarda en la base)
  const openByResource = new Map<string, Map<number, number[]>>()
  for (const slot of availability) {
    const byDay = openByResource.get(slot.resource_id) ?? new Map<number, number[]>()
    const list = byDay.get(Number(slot.day_of_week)) ?? []
    list.push(Number(slot.slot_index))
    byDay.set(Number(slot.day_of_week), list)
    openByResource.set(slot.resource_id, byDay)
  }
  const isOff = (resourceId: string, key: string) =>
    timeOff.some(off => (off.resource_id === null || off.resource_id === resourceId) && off.starts_on <= key && off.ends_on >= key)

  let openMinutes = 0
  for (let day = new Date(range.from); day < until; day = addDays(day, 1)) {
    const key = dayKeyOf(day)
    const weekday = (day.getDay() + 6) % 7
    for (const [resourceId, byDay] of openByResource) {
      if (isOff(resourceId, key)) continue
      for (const slot of byDay.get(day.getDay()) ?? []) {
        heat[weekday][Math.floor(slot / 2)].open += 30
        openMinutes += 30
      }
    }
  }

  let bookedMinutes = 0
  for (const r of reservations) {
    if (r.status === 'cancelled') continue
    const start = new Date(r.starts_at)
    if (start >= until || start < range.from) continue
    const end = r.ends_at ? new Date(r.ends_at) : new Date(start.getTime() + 30 * 60_000)
    const minutes = Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000))
    bookedMinutes += minutes
    // Se reparte en las horas que ocupa, de a media hora
    for (let offset = 0; offset < minutes; offset += 30) {
      const { weekday, hour } = localParts(new Date(start.getTime() + offset * 60_000).toISOString())
      heat[weekday][hour].booked += Math.min(30, minutes - offset)
    }
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => heat.some(row => row[hour].open > 0 || row[hour].booked > 0))
  const quiet = heat.flatMap((row, weekday) => row.map((cell, hour) => ({ weekday, hour, cell })))
    .filter(({ cell }) => cell.open >= 120) // franjas que estuvieron abiertas al menos dos veces (dos horas en total)
    .map(({ weekday, hour, cell }) => ({ weekday, hour, rate: Math.round(Math.min(1, cell.booked / cell.open) * 100) }))
    .filter(item => item.rate < 35)
    .sort((a, b) => a.rate - b.rate || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, 3)

  return {
    rate: openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : null,
    openMinutes, bookedMinutes, measuredUntil: until, heat, hours, quiet,
  }
}

// ── Clientes: frecuencia, en riesgo, los mejores y los que más faltan ───────
// Se mira toda la historia del negocio, no solo el período: hace falta para saber cada cuánto viene cada uno.

type HistoryLike = { client_id?: string | null; starts_at: string; status: StatsReservation['status']; clients: { name: string; email?: string | null } | null; services: StatsReservation['services'] }

export type ClientInsight = {
  id: string
  name: string
  email: string | null
  visits: number
  revenue: number
  noShows: number
  lastVisit: string | null
  everyDays: number | null // cada cuántos días suele volver
  daysSince: number | null
  hasUpcoming: boolean
}

export type ClientsOverview = {
  typicalReturnDays: number | null // cada cuántos días vuelve un cliente, en general (mediana)
  returnRate: number | null // de los clientes que vinieron, cuántos volvieron al menos una vez (%)
  atRisk: ClientInsight[] // pasaron bastante más tiempo del habitual sin volver y no tienen turno
  best: ClientInsight[]
  frequentNoShows: ClientInsight[]
}

const median = (values: number[]) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeClients(history: HistoryLike[], now = Date.now()): ClientsOverview {
  const byClient = new Map<string, { name: string; email: string | null; visits: number[]; revenue: number; noShows: number; hasUpcoming: boolean }>()
  for (const r of history) {
    if (!r.client_id || r.status === 'cancelled') continue
    const entry = byClient.get(r.client_id) ?? { name: r.clients?.name ?? 'Cliente', email: r.clients?.email ?? null, visits: [], revenue: 0, noShows: 0, hasUpcoming: false }
    const time = new Date(r.starts_at).getTime()
    if (r.status === 'completed') {
      entry.visits.push(time)
      entry.revenue += r.services?.price_mode === 'ask' ? 0 : Number(r.services?.price ?? 0) || 0
    } else if (r.status === 'no_show') entry.noShows += 1
    else if (time >= now) entry.hasUpcoming = true
    byClient.set(r.client_id, entry)
  }

  const insights: ClientInsight[] = [...byClient].map(([id, entry]) => {
    const visits = entry.visits.sort((a, b) => a - b)
    const gaps = visits.slice(1).map((time, index) => (time - visits[index]) / DAY_MS)
    const everyDays = gaps.length > 0 ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null
    const last = visits.length > 0 ? visits[visits.length - 1] : null
    return {
      id, name: entry.name, email: entry.email, visits: visits.length, revenue: entry.revenue, noShows: entry.noShows,
      lastVisit: last === null ? null : new Date(last).toISOString(),
      everyDays,
      daysSince: last === null ? null : Math.floor((now - last) / DAY_MS),
      hasUpcoming: entry.hasUpcoming,
    }
  })

  const cameOnce = insights.filter(client => client.visits >= 1)
  // En riesgo: vino al menos 2 veces, no tiene turno reservado y ya pasó una vez y media lo que suele tardar (mínimo 3 semanas)
  const atRisk = insights
    .filter(client => client.visits >= 2 && !client.hasUpcoming && client.everyDays !== null && client.daysSince !== null
      && client.daysSince >= Math.max(21, client.everyDays * 1.5))
    .sort((a, b) => (b.daysSince! / Math.max(1, b.everyDays!)) - (a.daysSince! / Math.max(1, a.everyDays!)))
  const typical = median(insights.filter(client => client.everyDays !== null).map(client => client.everyDays!))

  return {
    typicalReturnDays: typical === null ? null : Math.round(typical),
    returnRate: cameOnce.length > 0 ? Math.round((cameOnce.filter(client => client.visits >= 2).length / cameOnce.length) * 100) : null,
    atRisk,
    best: [...cameOnce].sort((a, b) => b.visits - a.visits || b.revenue - a.revenue).slice(0, 5),
    frequentNoShows: insights.filter(client => client.noShows >= 2).sort((a, b) => b.noShows - a.noShows).slice(0, 5),
  }
}

// ── Meta del mes ───────────────────────────────────────────────────────────

export type GoalProgress = {
  goal: number
  earned: number
  percent: number // puede pasar de 100
  remaining: number
  daysLeft: number // incluido hoy, si es el mes en curso
  expectedPercent: number | null // dónde "debería" estar a esta altura del mes (solo el mes en curso)
  booked: number // lo que suman los turnos confirmados que faltan este mes
}

export function computeGoal(range: StatsRange, goal: number, reservations: StatsReservation[], now = new Date()): GoalProgress {
  const totals = periodTotals(reservations, now.getTime())
  const booked = reservations
    .filter(r => r.status === 'confirmed' && new Date(r.starts_at).getTime() >= now.getTime())
    .reduce((sum, r) => sum + priceOf(r).amount, 0)
  const isCurrent = range.from <= now && now < range.to
  const total = rangeDays(range)
  const passed = isCurrent ? Math.round((startOfDay(now).getTime() - range.from.getTime()) / DAY_MS) + 1 : total
  return {
    goal,
    earned: totals.revenue,
    percent: Math.round((totals.revenue / goal) * 100),
    remaining: Math.max(0, goal - totals.revenue),
    daysLeft: isCurrent ? total - passed + 1 : 0,
    expectedPercent: isCurrent ? Math.round((passed / total) * 100) : null,
    booked,
  }
}
