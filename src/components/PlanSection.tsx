import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Lock, Sparkles } from 'lucide-react'
import { BillingToggle, PlanCards, PlanComparison, ProSemesterOffer } from './Pricing'
import { formatPrice } from '../data/demo'
import { countMonthReservations, type Professional } from '../lib/db'
import type { Business } from '../lib/auth'
import { buildRange } from '../lib/stats'
import { PLANS, TRIAL_DAYS, contractedPlan, effectivePlan, trialDaysLeft, trialEndsAt, type Billing, type Plan } from '../lib/plans'

// "Tu plan": en qué plan está el negocio, cuánto usa de lo que incluye y los planes para elegir.
// Todavía no hay cobro: elegir un plan pago avisa que el pago llega pronto (no se cambia nada).

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function PlanSection({ business, professionals }: { business: Business; professionals: Professional[] }) {
  const contracted = contractedPlan(business)
  const plan = effectivePlan(business)
  const daysLeft = trialDaysLeft(business)
  const trialEnd = trialEndsAt(business)
  const [billing, setBilling] = useState<Billing>('mensual')
  const [monthCount, setMonthCount] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const month = buildRange('month', new Date())
    let active = true
    void countMonthReservations(business.id, month.from, month.to).then(count => { if (active) setMonthCount(count) })
    return () => { active = false }
  }, [business.id])

  const limits = PLANS[plan].limits
  const activePros = professionals.filter(p => p.is_active).length
  // Lo que pasa cuando termina la prueba, si hoy usa más de lo que incluye su plan
  const afterTrialPros = PLANS[contracted].limits.professionals
  const loseOnTrialEnd = daysLeft !== null && afterTrialPros !== null && activePros > afterTrialPros

  function choose(target: Plan) {
    setNotice(target === 'gratis'
      ? daysLeft !== null ? 'Cuando termine la prueba seguís en el plan Gratis: no tenés que hacer nada.' : 'Ya estás en el plan Gratis.'
      : `Todavía no se puede pagar desde RESER: el pago con Mercado Pago llega muy pronto. Te avisamos por email para que puedas pasarte al ${PLANS[target].name}${target === 'basico' && !business.trial_ends_at ? ` (y te regalamos ${TRIAL_DAYS} días del Pro)` : ''}.`)
  }

  return <div className="plan-page">
    <section className={`agenda-card plan-current${contracted === 'pro' ? ' plan-current--pro' : ''}`} aria-labelledby="plan-current-title">
      <div className="plan-current-copy">
        <h2 id="plan-current-title">{daysLeft !== null ? 'Estás probando el plan Pro' : `Estás en el plan ${PLANS[contracted].name}`}</h2>
        <p>{daysLeft !== null && trialEnd
          ? `Te ${daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`} de prueba, hasta el ${trialEnd.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}. Después seguís en el plan ${PLANS[contracted].name}, salvo que elijas otro.`
          : contracted === 'gratis' ? 'Es gratis para siempre. Cuando tu negocio crezca, pasate a un plan con más lugar.'
          : `${formatPrice(PLANS[contracted].monthly)} por mes.`}</p>
        {loseOnTrialEnd && <p className="plan-warning">
          El plan {PLANS[contracted].name} incluye {plural(afterTrialPros!, 'profesional', 'profesionales')}: cuando termine la prueba, los demás dejan de recibir turnos (siguen en tu equipo).
        </p>}
      </div>
      {daysLeft !== null && <div className="plan-trial" aria-hidden="true">
        <span style={{ width: `${Math.max(4, Math.min(100, ((TRIAL_DAYS - daysLeft) / TRIAL_DAYS) * 100))}%` }} />
      </div>}
      <dl className="plan-usage">
        <Usage label="Profesionales activos" used={activePros} limit={limits.professionals}
          over={extra => `${plural(extra, 'no recibe', 'no reciben')} turnos: tu plan incluye ${plural(limits.professionals ?? 0, 'profesional', 'profesionales')}`} />
        <Usage label="Turnos este mes" used={monthCount} limit={limits.monthlyBookings} />
      </dl>
    </section>

    <section className="plan-choose" aria-labelledby="plan-choose-title">
      <div className="plan-choose-head">
        <h2 id="plan-choose-title">Elegí tu plan</h2>
        <BillingToggle billing={billing} onChange={setBilling} />
      </div>
      <PlanCards
        billing={billing}
        current={daysLeft !== null ? null : contracted}
        trialGift={!business.trial_ends_at}
        action={target => target === contracted && daysLeft === null
          ? { label: 'Tu plan actual', onClick: () => undefined, disabled: true }
          : { label: target === 'gratis' ? 'Seguir en Gratis' : `Pasarme al ${PLANS[target].name}`, onClick: () => choose(target) }}
      />
      <ProSemesterOffer><button type="button" className="button button--secondary" onClick={() => choose('pro')}>Quiero el Pro semestral <ArrowRight size={16} aria-hidden="true" /></button></ProSemesterOffer>
      {notice && <p className="plan-notice" role="status">{notice}</p>}
      <details className="plan-compare">
        <summary>Comparar todo lo que trae cada plan</summary>
        <PlanComparison current={plan} />
      </details>
    </section>
  </div>
}

function Usage({ label, used, limit, over }: { label: string; used: number | null; limit: number | null; over?: (extra: number) => string }) {
  const full = limit !== null && used !== null && used >= limit
  const extra = limit !== null && used !== null ? used - limit : 0
  return <div className="plan-usage-item">
    <dt>{label}</dt>
    <dd><strong>{used ?? '…'}</strong> {limit === null ? <span>sin límite</span> : <span>de {limit}</span>}</dd>
    {limit !== null && <span className={`plan-usage-bar${full ? ' is-full' : ''}`} aria-hidden="true"><span style={{ width: `${used === null ? 0 : Math.min(100, (used / limit) * 100)}%` }} /></span>}
    {full && <small className="plan-usage-full">{extra > 0 && over ? over(extra) : 'Llegaste al límite de tu plan'}</small>}
  </div>
}

// Aviso chico de "esto es parte de otro plan", con el acceso a Tu plan
export function PlanNote({ children, onSeePlans }: { children: ReactNode; onSeePlans: () => void }) {
  return <p className="plan-note">
    <Lock size={14} aria-hidden="true" />
    <span>{children} <button type="button" className="link-button" onClick={onSeePlans}>Ver planes</button></span>
  </p>
}

// En el Resumen, desde el 80 % de los turnos del mes que incluye el plan. Con el cupo lleno la página pública deja de
// mostrar horarios, y sin este aviso el dueño no se enteraba. refreshKey: cambia cuando cambian las reservas.
export function MonthLimitNotice({ business, refreshKey, onSeePlans }: { business: Business; refreshKey: unknown; onSeePlans: () => void }) {
  const limit = PLANS[effectivePlan(business)].limits.monthlyBookings
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (limit === null) return
    const month = buildRange('month', new Date())
    let active = true
    void countMonthReservations(business.id, month.from, month.to).then(value => { if (active) setCount(value) })
    return () => { active = false }
  }, [business.id, limit, refreshKey])
  if (limit === null || count === null || count < limit * 0.8) return null
  return <PlanNote onSeePlans={onSeePlans}>
    {count >= limit
      ? `Llegaste a los ${limit} turnos del mes de tu plan: tu página no muestra más horarios hasta el mes que viene.`
      : `Ya usaste ${count} de los ${limit} turnos del mes de tu plan.`}
  </PlanNote>
}

// En el encabezado del panel mientras dura la prueba; los últimos 3 días se hace notar
export function TrialBadge({ business, onOpen }: { business: Business; onOpen: () => void }) {
  const days = trialDaysLeft(business)
  if (days === null) return null
  const left = days === 1 ? 'queda 1 día' : `quedan ${days} días`
  return <button type="button" className={`trial-badge${days <= 3 ? ' is-ending' : ''}`} onClick={onOpen}>
    <Sparkles size={14} aria-hidden="true" />
    <span className="trial-badge-long">Prueba del Pro: {left}</span>
    <span className="trial-badge-short" aria-hidden="true">Pro · {days} {days === 1 ? 'día' : 'días'}</span>
  </button>
}
