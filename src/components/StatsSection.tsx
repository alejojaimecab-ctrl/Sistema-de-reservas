import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Lock, Mail, Minus, Pencil, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { SegmentIndicator } from './SegmentIndicator'
import { CountUp, Gauge, MiniBars, Ring, Sparkline, TrendChart, type TrendPoint } from './stats/Charts'
import { buildStatsWorkbook, statsFileName } from '../lib/statsExport'
import { downloadBlob } from '../lib/xlsx'
import { formatPrice } from '../data/demo'
import { useAuth } from '../lib/auth'
import {
  listAllReservations, listBusinessAvailability, listStatsReservations, listTimeOffBetween, updateMonthlyGoal,
  type HistoryReservation, type OpenSlot, type StatsReservation, type TimeOff,
} from '../lib/db'
import {
  buildRange, comparisonLabel, computeClients, computeGoal, computeOccupancy, computeStats, delta, previousRange, rangeLabel, shiftRange,
  WEEKDAY_LABELS, type ClientInsight, type ClientsOverview, type GoalProgress, type Occupancy, type RangeKind, type Stats, type StatsRange,
} from '../lib/stats'

const KINDS: { kind: RangeKind; label: string }[] = [
  { kind: 'month', label: 'Mes' },
  { kind: 'week', label: 'Semana' },
  { kind: '30d', label: '30 días' },
  { kind: '90d', label: '90 días' },
  { kind: 'year', label: 'Año' },
  { kind: 'custom', label: 'Rango' },
]
const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const toInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fromInputDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1) }
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
// Orden de entrada de cada tarjeta: aparecen una tras otra, como en el video de referencia
const rise = (index: number) => ({ '--i': String(index) } as CSSProperties)
const shortMoney = (n: number) => n >= 1_000_000 ? `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `$ ${Math.round(n / 1000).toLocaleString('es-AR')} mil` : formatPrice(n)

// Ganancias del período para la línea grande: por día hasta 2 meses, por semana hasta 6 meses y por mes en adelante
function buildTrend(daily: Stats['daily']): TrendPoint[] {
  const parse = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
  const dayLabel = (date: Date) => date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '').replace(/ de /g, ' ')
  if (daily.length <= 62) return daily.map(day => {
    const date = parse(day.dayKey)
    return { key: day.dayKey, label: String(date.getDate()), detail: date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }), value: day.revenue }
  })
  const buckets = new Map<string, { start: Date; end: Date; value: number }>()
  for (const day of daily) {
    const date = parse(day.dayKey)
    const start = daily.length <= 184
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))
      : new Date(date.getFullYear(), date.getMonth(), 1)
    const key = start.toISOString()
    const bucket = buckets.get(key) ?? { start, end: date, value: 0 }
    bucket.value += day.revenue
    bucket.end = date
    buckets.set(key, bucket)
  }
  return [...buckets.entries()].map(([key, bucket]) => daily.length <= 184
    ? { key, label: dayLabel(bucket.start), detail: `Semana del ${dayLabel(bucket.start)} al ${dayLabel(bucket.end)}`, value: bucket.value }
    : { key, label: bucket.start.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''), detail: bucket.start.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }), value: bucket.value })
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '').replace(/ de /g, ' ')

type PeriodData = { current: StatsReservation[]; previous: StatsReservation[]; availability: OpenSlot[]; timeOff: TimeOff[] }

// Estadísticas del negocio (plan Pro): cómo le fue en un período, cómo viene contra el anterior,
// cuánto se llenó la agenda, la meta del mes y qué clientes conviene recuperar.
export function StatsSection({ businessId, onOpenUnmarked }: { businessId: string; onOpenUnmarked: () => void }) {
  const { business, refreshBusiness } = useAuth()
  const [range, setRange] = useState<StatsRange>(() => buildRange('month', new Date()))
  const [data, setData] = useState<PeriodData | null>(null)
  const [history, setHistory] = useState<HistoryReservation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const kindGroup = useId()

  const previous = useMemo(() => previousRange(range), [range])

  useEffect(() => {
    let active = true
    setError(null)
    setData(null)
    // Una sola consulta trae el período y el anterior; después se separan por fecha
    Promise.all([
      listStatsReservations(businessId, previous.from, range.to),
      listBusinessAvailability(businessId),
      listTimeOffBetween(businessId, range.from, range.to),
    ]).then(([result, availability, timeOff]) => {
      if (!active) return
      if (result.error) { setError(result.error); return }
      const current = result.reservations.filter(r => new Date(r.starts_at) >= range.from)
      const before = result.reservations.filter(r => new Date(r.starts_at) < range.from)
      setData({ current, previous: before, availability, timeOff })
    }).catch(() => { if (active) setError('Revisá tu conexión e intentá de nuevo.') })
    return () => { active = false }
  }, [businessId, range, previous, retry])

  // Los clientes se miran en toda la historia (no cambia con el período)
  useEffect(() => {
    let active = true
    listAllReservations(businessId).then(result => { if (active) setHistory(result.error ? [] : result.reservations) })
    return () => { active = false }
  }, [businessId, retry])

  // Primera visita de cada cliente (para separar nuevos de los que vuelven), sacada de la historia completa
  const firstVisits = useMemo(() => {
    if (!history) return null
    const first = new Map<string, string>()
    for (const r of history) {
      if (!r.client_id || r.status === 'cancelled') continue
      const known = first.get(r.client_id)
      if (!known || new Date(r.starts_at) < new Date(known)) first.set(r.client_id, r.starts_at)
    }
    return first
  }, [history])
  const stats: Stats | null = useMemo(() => data ? computeStats(range, data.current, data.previous, firstVisits) : null, [data, range, firstVisits])
  const occupancy: Occupancy | null = useMemo(() => data ? computeOccupancy(range, data.current, data.availability, data.timeOff) : null, [data, range])
  const previousOccupancy: Occupancy | null = useMemo(() => data ? computeOccupancy(previous, data.previous, data.availability, []) : null, [data, previous])
  const clients: ClientsOverview | null = useMemo(() => history ? computeClients(history) : null, [history])
  const goal = business?.monthly_goal ?? null
  const goalProgress: GoalProgress | null = useMemo(() => data && goal && range.kind === 'month' ? computeGoal(range, Number(goal), data.current) : null, [data, goal, range])

  // Exportar: Excel con el detalle en hojas, o PDF con la impresión del navegador (en colores claros, ver relief.css)
  const businessName = business?.name ?? 'Negocio'
  const canExport = Boolean(stats && occupancy && data)
  function exportExcel() {
    if (!stats || !occupancy || !data) return
    const blob = buildStatsWorkbook({ businessName, range, previous, stats, occupancy, previousOccupancy, goal: goalProgress, clients, reservations: data.current })
    downloadBlob(blob, statsFileName(businessName, range, 'xlsx'))
  }
  function exportPdf() {
    const root = document.documentElement
    const title = document.title
    // El nombre que propone "Guardar como PDF" sale del título de la página
    document.title = statsFileName(businessName, range, 'pdf').replace(/\.pdf$/, '')
    root.classList.add('printing-stats')
    const done = () => { root.classList.remove('printing-stats'); document.title = title; window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }

  function pickKind(kind: RangeKind) {
    if (kind === range.kind) return
    setRange(kind === 'custom' ? buildRange('custom', new Date(), { from: range.from, to: new Date(range.to.getTime() - 1) }) : buildRange(kind, new Date()))
  }
  const isCurrent = range.to.getTime() > Date.now() && range.from.getTime() <= Date.now()

  return <div className="stats">
    <section className="agenda-card stats-period stats-rise" style={rise(0)} aria-label="Período">
      <div className="calendar-mode stats-kinds" role="group" aria-label="Tipo de período">
        {KINDS.map(({ kind, label }) => <button type="button" key={kind} aria-pressed={range.kind === kind} className={range.kind === kind ? 'is-active' : ''} onClick={() => pickKind(kind)}>
          {range.kind === kind && <SegmentIndicator group={kindGroup} />}{label}
        </button>)}
      </div>
      {range.kind === 'custom'
        ? <div className="stats-custom">
          <label>Desde<input type="date" value={toInputDate(range.from)} max={toInputDate(new Date(range.to.getTime() - 1))} onChange={event => event.target.value && setRange(buildRange('custom', new Date(), { from: fromInputDate(event.target.value), to: new Date(range.to.getTime() - 1) }))} /></label>
          <label>Hasta<input type="date" value={toInputDate(new Date(range.to.getTime() - 1))} min={toInputDate(range.from)} onChange={event => event.target.value && setRange(buildRange('custom', new Date(), { from: range.from, to: fromInputDate(event.target.value) }))} /></label>
        </div>
        : <div className="stats-nav">
          <button type="button" className="calendar-detail-arrow" aria-label="Período anterior" onClick={() => setRange(current => shiftRange(current, -1))}><ChevronLeft size={17} /></button>
          <h2 aria-live="polite" key={rangeLabel(range)} className="stats-focus">{rangeLabel(range)}</h2>
          <button type="button" className="calendar-detail-arrow" aria-label="Período siguiente" disabled={isCurrent} onClick={() => setRange(current => shiftRange(current, 1))}><ChevronRight size={17} /></button>
          {!isCurrent && <button type="button" className="calendar-today" onClick={() => setRange(buildRange(range.kind, new Date()))}>Hoy</button>}
        </div>}
      <div className="stats-period-foot">
        <p className="stats-compare">Comparado {comparisonLabel(range.kind).replace('vs. ', 'con ')} ({rangeLabel(previous)}).</p>
        <ExportMenu disabled={!canExport} onExcel={exportExcel} onPdf={exportPdf} />
      </div>
    </section>

    {/* Solo en el PDF: de quién y de qué período es el informe */}
    <div className="stats-print-head" aria-hidden="true">
      <strong>Estadísticas · {businessName}</strong>
      <span>{rangeLabel(range)} · comparado con {rangeLabel(previous)} · exportado el {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>

    {error ? <p className="form-error" role="alert">No pudimos cargar las estadísticas: {error} <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>
      : !stats || !occupancy ? <div className="stats-loading" role="status"><span className="sr-only">Cargando estadísticas</span>{[0, 1, 2, 3].map(i => <span key={i} aria-hidden="true" />)}</div>
      : <Fragment key={`${range.kind}-${range.from.getTime()}-${range.to.getTime()}`}>
        {range.kind === 'month' && <GoalCard businessId={businessId} goal={goal === null ? null : Number(goal)} progress={goalProgress} monthLabel={rangeLabel(range)} onSaved={refreshBusiness} />}
        <StatsBody stats={stats} occupancy={occupancy} previousOccupancy={previousOccupancy} kind={range.kind} isCurrent={isCurrent} onOpenUnmarked={onOpenUnmarked} />
      </Fragment>}

    <ClientsCard clients={clients} />
  </div>
}

// Sin el plan Pro la sección se ve igual: una muestra borrosa (inventada, no son sus datos) y el acceso a Tu plan.
const LOCKED_KPIS = [['Ganancias', '$ 1.240.000'], ['Clientes atendidos', '186'], ['Ocupación', '72%'], ['Asistencia', '94%']]
const LOCKED_BARS = [46, 72, 58, 64, 51, 92, 38]

export function StatsLocked({ onSeePlans }: { onSeePlans: () => void }) {
  return <div className="stats stats-locked">
    <div className="stats-locked-preview" aria-hidden="true" inert>
      <div className="stats-kpis">
        {LOCKED_KPIS.map(([label, value]) => <div className="metric" key={label}><div><span>{label}</span><strong>{value}</strong><small>+12% vs. el mes pasado</small></div></div>)}
      </div>
      <div className="stats-grid">
        <section className="agenda-card stats-locked-bars">{LOCKED_BARS.map((height, index) => <i key={index} style={{ height: `${height}%` }} className={index === 5 ? 'is-top' : undefined} />)}</section>
        <section className="agenda-card stats-locked-lines"><b /><b /><b /><b /></section>
      </div>
    </div>
    <section className="stats-locked-panel stats-rise" aria-labelledby="stats-locked-title">
      <span className="stats-locked-icon"><Lock size={22} aria-hidden="true" /></span>
      <h2 id="stats-locked-title">Disponible en el plan Pro</h2>
      <p>Ganancias del mes, clientes atendidos, tu mejor día de la semana y más, todo en un solo lugar.</p>
      <button type="button" className="button button--primary" onClick={onSeePlans}>Ver el plan Pro</button>
    </section>
  </div>
}

function StatsBody({ stats, occupancy, previousOccupancy, kind, isCurrent, onOpenUnmarked }: {
  stats: Stats; occupancy: Occupancy; previousOccupancy: Occupancy | null; kind: RangeKind; isCurrent: boolean; onOpenUnmarked: () => void
}) {
  const { current: now, previous: before } = stats
  const anyTurns = now.attended + now.noShow + now.unmarked + now.upcoming + now.cancelledByClient + now.cancelledByOwner > 0
  if (!anyTurns && occupancy.openMinutes === 0) return <section className="agenda-card stats-empty">
    <strong>No hubo turnos en este período</strong>
    <p>Probá con otro período o esperá a que lleguen reservas: acá vas a ver cómo te fue.</p>
  </section>

  const compare = comparisonLabel(kind)
  const notes = [
    now.revenueFromCount > 0 ? `${count(now.revenueFromCount, 'turno atendido es', 'turnos atendidos son')} de servicios "Desde": se cuentan por el precio mínimo.` : null,
    now.revenueAskCount > 0 ? `${count(now.revenueAskCount, 'turno atendido es', 'turnos atendidos son')} de servicios "A consultar": no suman a las ganancias.` : null,
    isCurrent ? 'La ocupación se mide hasta hoy: los días que faltan todavía se pueden llenar.' : null,
  ].filter(Boolean) as string[]

  const trend = buildTrend(stats.daily)
  const revenueChange = delta(now.revenue, before.revenue)
  return <>
    <div className="stats-kpis">
      <Kpi index={2} label="Ganancias" value={now.revenue} format={n => formatPrice(Math.round(n))} change={revenueChange} compare={compare}
        chart={<Sparkline values={stats.daily.map(day => day.revenue)} delay={350} label="Ganancias por día del período" />} />
      <Kpi index={3} label="Clientes atendidos" value={now.clientsAttended} format={n => String(Math.round(n))} change={delta(now.clientsAttended, before.clientsAttended)} compare={compare}
        chart={<MiniBars values={stats.daily.map(day => day.attended)} delay={420} label="Turnos atendidos por día" />} />
      <Kpi index={4} label="Ocupación" value={occupancy.rate} format={n => `${Math.round(n)}%`}
        change={occupancy.rate === null || previousOccupancy?.rate == null ? null : occupancy.rate - previousOccupancy.rate} unit="puntos" compare={compare}
        detail={occupancy.rate === null ? 'Cargá tus horarios en Equipo para medirla' : undefined}
        chart={<Ring percent={occupancy.rate} delay={490} label={`Ocupación: ${occupancy.rate ?? 0}%`} />} />
      <Kpi index={5} label="Asistencia" value={now.attendanceRate} format={n => `${Math.round(n)}%`} change={now.attendanceRate === null || before.attendanceRate === null ? null : now.attendanceRate - before.attendanceRate} unit="puntos" compare={compare}
        chart={<Ring percent={now.attendanceRate} delay={560} label={`Asistencia: ${now.attendanceRate ?? 0}%`} />} />
    </div>

    <section className="agenda-card stats-trend-card stats-rise" style={rise(6)} aria-labelledby="stats-trend-title">
      <div className="stats-trend-head">
        <div>
          <h3 id="stats-trend-title">Ganancias</h3>
          <p className="stats-trend-total"><CountUp value={now.revenue} format={n => formatPrice(Math.round(n))} delay={500} duration={1300} /></p>
        </div>
        {revenueChange !== null && <span className={`stats-pill is-${revenueChange > 0 ? 'up' : revenueChange < 0 ? 'down' : 'flat'}`}>{revenueChange > 0 ? '+' : ''}{revenueChange}% {compare}</span>}
      </div>
      <TrendChart points={trend} format={n => formatPrice(Math.round(n))} formatAxis={shortMoney}
        ariaLabel={`Ganancias del período: ${formatPrice(now.revenue)}. Usá las flechas para recorrer cada ${trend.length > 62 ? 'tramo' : 'día'}.`} />
    </section>

    {now.unmarked > 0 && <p className="stats-pending" role="status">
      <span>{count(now.unmarked, 'turno de este período está', 'turnos de este período están')} sin marcar: no cuentan hasta que digas si vinieron.</span>
      <button type="button" className="link-button" onClick={onOpenUnmarked}>Marcarlos en Reservas</button>
    </p>}

    <HeatmapCard occupancy={occupancy} stats={stats} index={7} />

    <div className="stats-grid">
      <section className="agenda-card stats-card stats-rise" style={rise(8)}>
        <h3>Turnos</h3>
        <dl className="stats-facts">
          <Fact label="Atendidos" value={now.attended} />
          <Fact label="No vinieron" value={now.noShow} />
          <Fact label="Sin marcar" value={now.unmarked} />
          <Fact label="Por venir" value={now.upcoming} />
          <Fact label="Cancelados por el cliente" value={now.cancelledByClient} />
          <Fact label="Cancelados por vos" value={now.cancelledByOwner} />
        </dl>
      </section>

      <section className="agenda-card stats-card stats-rise" style={rise(9)}>
        <h3>Clientes del período</h3>
        <dl className="stats-facts">
          <Fact label="Atendidos" value={now.clientsAttended} />
          <Fact label="Primera vez" value={stats.newClients ?? '…'} />
          <Fact label="Volvieron" value={stats.returningClients ?? '…'} />
          <Fact label="Ticket promedio" value={now.averageTicket === null ? '—' : formatPrice(now.averageTicket)} />
          <Fact label="Reservaron por tu enlace" value={stats.bySource.link} />
          <Fact label="Los anotaste vos" value={stats.bySource.manual} />
          <Fact label="Anticipación promedio" value={stats.leadTimeDays === null ? '—' : stats.leadTimeDays < 1 ? 'El mismo día' : `${stats.leadTimeDays.toLocaleString('es-AR')} días`} />
        </dl>
      </section>

      <RankingCard title="Servicios" items={stats.byService} index={10} />
      {stats.byProfessional.length > 1 && <RankingCard title="Profesionales" items={stats.byProfessional} index={11} />}
    </div>

    {notes.length > 0 && <ul className="stats-notes">{notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </>
}

// ── Meta del mes ─────────────────────────────────────────────────────────

function GoalCard({ businessId, goal, progress, monthLabel, onSaved }: { businessId: string; goal: number | null; progress: GoalProgress | null; monthLabel: string; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(goal ? Math.round(goal).toLocaleString('es-AR') : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  async function save(event: FormEvent) {
    event.preventDefault()
    const amount = Number(value.replace(/\D/g, ''))
    if (value.trim() !== '' && (!Number.isFinite(amount) || amount <= 0)) { setError('Escribí un monto mayor a cero.'); return }
    setBusy(true)
    setError(null)
    const saveError = await updateMonthlyGoal(businessId, value.trim() === '' ? null : amount)
    setBusy(false)
    if (saveError) { setError(saveError); return }
    await onSaved()
    setEditing(false)
  }

  if (!goal || editing) return <section className="agenda-card stats-goal stats-rise" style={rise(1)}>
    <div className="stats-goal-head"><span className="stats-goal-icon" aria-hidden="true"><Target size={18} /></span><div><h3>{goal ? 'Cambiar tu meta mensual' : 'Fijate una meta para el mes'}</h3><p>Cuánto querés ganar por mes. Te mostramos si la vas cumpliendo.</p></div></div>
    <form className="stats-goal-form" onSubmit={event => void save(event)} noValidate>
      <label htmlFor={inputId} className="sr-only">Meta de ganancias por mes</label>
      <div className="stats-goal-input"><span aria-hidden="true">$</span><input id={inputId} inputMode="numeric" autoComplete="off" placeholder="800.000" value={value} aria-invalid={Boolean(error)} onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 10); setValue(digits ? Number(digits).toLocaleString('es-AR') : ''); setError(null) }} /></div>
      <button type="submit" className="button button--secondary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar meta'}</button>
      {goal && <button type="button" className="text-button" onClick={() => { setEditing(false); setError(null); setValue(Math.round(goal).toLocaleString('es-AR')) }}>Cancelar</button>}
    </form>
    {goal && <button type="button" className="text-button stats-goal-remove" disabled={busy} onClick={() => { setValue(''); void updateMonthlyGoal(businessId, null).then(async problem => { if (problem) setError(problem); else { await onSaved(); setEditing(false) } }) }}>Quitar la meta</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>

  if (!progress) return null
  const reached = progress.percent >= 100
  const ahead = progress.expectedPercent !== null && progress.percent >= progress.expectedPercent
  return <section className="agenda-card stats-goal stats-goal--progress stats-rise" style={rise(1)} aria-labelledby="stats-goal-title">
    <div className="stats-goal-head">
      <span className="stats-goal-icon" aria-hidden="true"><Target size={18} /></span>
      <div><h3 id="stats-goal-title">Meta de {monthLabel.toLowerCase()}</h3><p>{formatPrice(progress.earned)} de {formatPrice(progress.goal)}</p></div>
      <button type="button" className="icon-button stats-goal-edit" aria-label="Cambiar la meta" onClick={() => setEditing(true)}><Pencil size={15} /></button>
    </div>
    <div className="stats-goal-body" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress.percent)} aria-label={`Llevás el ${progress.percent}% de la meta`}>
      <Gauge percent={progress.percent} expected={progress.expectedPercent} delay={250}>
        <strong><CountUp value={progress.percent} format={n => `${Math.round(n)}%`} delay={250} duration={1300} /></strong>
        <small>de la meta</small>
      </Gauge>
    </div>
    {progress.expectedPercent !== null && progress.expectedPercent < 100 && <p className="stats-goal-legend"><b aria-hidden="true" /> Dónde deberías estar hoy para llegar ({progress.expectedPercent}%)</p>}
    <p className="stats-goal-status">
      <strong>{progress.percent}%</strong>
      {reached ? ' · ¡Llegaste a la meta!'
        : progress.daysLeft > 0 ? ` · Faltan ${formatPrice(progress.remaining)} y quedan ${count(progress.daysLeft, 'día', 'días')}${ahead ? '. Vas adelantado.' : '. Vas un poco atrasado.'}`
        : ` · Quedaron ${formatPrice(progress.remaining)} sin llegar.`}
    </p>
    {!reached && progress.booked > 0 && progress.daysLeft > 0 && <p className="stats-goal-note">Con los turnos confirmados que faltan sumarías {formatPrice(progress.booked)} más ({Math.round(((progress.earned + progress.booked) / progress.goal) * 100)}% de la meta).</p>}
  </section>
}

// ── Mapa de calor: qué días y horarios se llenan ───────────────────────

function HeatmapCard({ occupancy, stats, index }: { occupancy: Occupancy; stats: Stats; index: number }) {
  const best = stats.bestWeekday === null ? null : stats.byWeekday[stats.bestWeekday]
  const busiestHour = stats.byHour.reduce((top, hour) => hour.turns > top.turns ? hour : top, { hour: -1, turns: 0 })
  if (occupancy.hours.length === 0) return null
  return <section className="agenda-card stats-heat-card stats-rise" style={rise(index)} aria-labelledby="stats-heat-title">
    <div className="stats-heat-head">
      <div><h3 id="stats-heat-title">Cuándo se llena tu agenda</h3><p>Cada casilla es una hora de un día de la semana: cuanto más clara, más ocupada.</p></div>
      <dl className="stats-heat-facts">
        {best && <div><dt>Mejor día</dt><dd>{best.label}</dd></div>}
        {busiestHour.turns > 0 && <div><dt>Hora más pedida</dt><dd>{busiestHour.hour} h</dd></div>}
      </dl>
    </div>
    <div className="stats-heat" role="table" aria-label="Ocupación por día de la semana y hora">
      <div role="row" className="stats-heat-row stats-heat-days"><span role="columnheader" />{SHORT_DAYS.map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
      {occupancy.hours.map(hour => <div role="row" className="stats-heat-row" key={hour}>
        <span role="rowheader" className="stats-heat-hour">{hour} h</span>
        {occupancy.heat.map((row, weekday) => {
          const cell = row[hour]
          // Fuera del horario cargado pero con turnos (por ejemplo, uno anotado a mano un domingo): se marca aparte
          const extra = cell.open === 0 && cell.booked > 0
          const rate = cell.open > 0 ? Math.min(1, cell.booked / cell.open) : null
          const text = extra ? 'turnos fuera de tu horario' : rate === null ? 'cerrado' : `${Math.round(rate * 100)}% ocupado`
          return <span role="cell" key={weekday} className={`stats-heat-cell${extra ? ' is-extra' : rate === null ? ' is-closed' : ''}`}
            style={rate === null ? undefined : { '--heat': String(0.06 + rate * 0.84) } as React.CSSProperties}
            aria-label={`${WEEKDAY_LABELS[weekday]} ${hour} h: ${text}`}
            title={`${WEEKDAY_LABELS[weekday]} ${hour} h · ${text}`} />
        })}
      </div>)}
    </div>
    <div className="stats-heat-legend" aria-hidden="true"><span>Vacío</span><i /><span>Lleno</span><span className="stats-heat-legend-closed"><b /> Cerrado</span><span className="stats-heat-legend-extra"><b /> Turnos fuera de horario</span></div>
    {occupancy.quiet.length > 0 && <p className="stats-heat-quiet"><strong>Huecos que se repiten:</strong> {occupancy.quiet.map(item => `${WEEKDAY_LABELS[item.weekday].toLowerCase()} a las ${item.hour} h (${item.rate}% ocupado)`).join(', ')}. Buen momento para una promo o para cerrar más temprano.</p>}
  </section>
}

// ── Clientes: cada cuánto vuelven y a quién conviene escribirle ───────────

function ClientsCard({ clients }: { clients: ClientsOverview | null }) {
  const [showAll, setShowAll] = useState(false)
  if (!clients) return <div className="stats-loading stats-loading--single" role="status"><span className="sr-only">Cargando clientes</span><span aria-hidden="true" /></div>
  const risk = showAll ? clients.atRisk : clients.atRisk.slice(0, 5)
  return <section className="agenda-card stats-clients stats-rise" style={rise(12)} aria-labelledby="stats-clients-title">
    <div className="stats-clients-head">
      <div><h3 id="stats-clients-title">Tus clientes</h3><p>En toda la historia del negocio, sin importar el período.</p></div>
      <dl className="stats-heat-facts">
        <div><dt>Vuelven cada</dt><dd>{clients.typicalReturnDays === null ? '—' : count(clients.typicalReturnDays, 'día', 'días')}</dd></div>
        <div><dt>Vuelven alguna vez</dt><dd>{clients.returnRate === null ? '—' : `${clients.returnRate}%`}</dd></div>
      </dl>
    </div>

    <div className="stats-clients-block">
      <h4>Para recuperar <span>{clients.atRisk.length}</span></h4>
      <p className="stats-muted">Clientes que ya pasaron bastante más de lo que suelen tardar en volver y no tienen turno reservado.</p>
      {clients.atRisk.length === 0 ? <p className="stats-ok">Nadie se está alejando: todos tus clientes habituales vienen a tiempo.</p>
        : <ul className="stats-people">{risk.map(client => <ClientRow key={client.id} client={client} detail={`Venía cada ${count(client.everyDays ?? 0, 'día', 'días')} · hace ${count(client.daysSince ?? 0, 'día', 'días')} que no viene`} withMail />)}</ul>}
      {clients.atRisk.length > 5 && <button type="button" className="link-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Ver menos' : `Ver los ${clients.atRisk.length}`}</button>}
    </div>

    <div className="stats-grid">
      <div className="stats-clients-block">
        <h4>Los que más vienen</h4>
        {clients.best.length === 0 ? <p className="stats-muted">Todavía no hay turnos atendidos.</p>
          : <ul className="stats-people">{clients.best.map(client => <ClientRow key={client.id} client={client} detail={`${count(client.visits, 'visita', 'visitas')}${client.revenue > 0 ? ` · ${formatPrice(client.revenue)}` : ''}`} />)}</ul>}
      </div>
      <div className="stats-clients-block">
        <h4>Los que más faltan</h4>
        {clients.frequentNoShows.length === 0 ? <p className="stats-muted">Ningún cliente faltó más de una vez.</p>
          : <ul className="stats-people">{clients.frequentNoShows.map(client => <ClientRow key={client.id} client={client} detail={`No vino ${count(client.noShows, 'vez', 'veces')}`} />)}</ul>}
      </div>
    </div>
  </section>
}

function ClientRow({ client, detail, withMail = false }: { client: ClientInsight; detail: string; withMail?: boolean }) {
  return <li>
    <span className="avatar" aria-hidden="true">{client.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')}</span>
    <div className="stats-people-info"><strong>{client.name}</strong><small>{detail}{client.lastVisit && !withMail ? ` · última vez el ${shortDate(client.lastVisit)}` : ''}</small></div>
    {withMail && client.email && <a className="stats-people-mail" href={`mailto:${client.email}?subject=${encodeURIComponent('¡Te extrañamos!')}`} aria-label={`Escribirle a ${client.name}`}><Mail size={15} aria-hidden="true" /><span>Escribirle</span></a>}
  </li>
}

// ── Exportar datos: un solo botón que abre las opciones ────────────────────
function ExportMenu({ disabled, onExcel, onPdf }: { disabled: boolean; onExcel: () => void; onPdf: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    // Foco en la primera opción; Escape o un clic afuera cierran
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointer = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); return }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey) }
  }, [open])

  const pick = (action: () => void) => { setOpen(false); buttonRef.current?.focus(); action() }
  return <div className="stats-export" ref={wrapRef}>
    <button ref={buttonRef} type="button" className="button button--secondary button--small" disabled={disabled}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
      <Download size={15} aria-hidden="true" /> Exportar datos <ChevronDown size={14} aria-hidden="true" className={`stats-export-caret${open ? ' is-open' : ''}`} />
    </button>
    {open && <div className="stats-export-menu" role="menu" id={menuId} aria-label="Formato">
      <button type="button" role="menuitem" onClick={() => pick(onExcel)}>
        <FileSpreadsheet size={17} aria-hidden="true" /><span><strong>Excel</strong><small>Todas las tablas, para sumar y filtrar</small></span>
      </button>
      <button type="button" role="menuitem" onClick={() => pick(onPdf)}>
        <FileText size={17} aria-hidden="true" /><span><strong>PDF</strong><small>El informe listo para imprimir o mandar</small></span>
      </button>
    </div>}
  </div>
}

// ── Piezas chicas ──────────────────────────────────────────────────────────

function Kpi({ index, label, value, format, change, unit = '%', compare, detail, chart }: { index: number; label: string; value: number | null; format: (n: number) => string; change?: number | null; unit?: '%' | 'puntos'; compare?: string; detail?: string; chart?: ReactNode }) {
  const trend = change === undefined || change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const amount = change === undefined || change === null ? '' : `${change > 0 ? '+' : ''}${change}${unit === '%' ? '%' : ` ${Math.abs(change) === 1 ? 'punto' : 'puntos'}`}`
  return <div className="metric stats-kpi stats-rise" style={rise(index)}>
    <div>
      <span>{label}</span>
      <strong>{value === null ? '—' : <CountUp value={value} format={format} delay={index * 70 + 150} />}</strong>
      {detail ? <small>{detail}</small>
        : trend ? <small className={`stats-trend is-${trend}`}><Icon size={13} aria-hidden="true" /> {amount} {compare}</small>
        : <small>Sin datos para comparar</small>}
    </div>
    {chart && <div className="stats-kpi-chart">{chart}</div>}
  </div>
}

function Fact({ label, value }: { label: string; value: number | string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function RankingCard({ title, items, index }: { title: string; items: Stats['byService']; index: number }) {
  const top = items.slice(0, 5)
  const max = Math.max(1, ...top.map(item => item.turns))
  return <section className="agenda-card stats-card stats-rise" style={rise(index)}>
    <h3>{title}</h3>
    {top.length === 0 ? <p className="stats-muted">Sin turnos en este período.</p>
      : <ol className="stats-ranking">{top.map(item => <li key={item.id}>
        <div className="stats-ranking-row"><span>{item.name}</span><b>{count(item.turns, 'turno', 'turnos')}{item.revenue > 0 ? ` · ${formatPrice(item.revenue)}` : ''}</b></div>
        <span className="stats-ranking-bar" aria-hidden="true"><span style={{ width: `${(item.turns / max) * 100}%`, '--draw-delay': `${index * 70 + 300}ms` } as CSSProperties} /></span>
      </li>)}</ol>}
  </section>
}
