import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, Minus } from 'lucide-react'
import { SegmentIndicator } from './SegmentIndicator'
import { Reveal } from './Reveal'
import { formatPrice } from '../data/demo'
import {
  ANNUAL_FREE_MONTHS, COMPARISON, PLAN_ORDER, PLANS, PRO_SEMESTER, TRIAL_DAYS, annualPrice, proSemesterPrice,
  type Billing, type Plan, type PlanInfo,
} from '../lib/plans'

// Los planes con sus precios, lado a lado. Lo usan la portada (#precios) y "Tu plan" del panel, así dicen siempre lo mismo.

export type PlanAction = { label: string; onClick: () => void; disabled?: boolean }

const perMonth = (plan: PlanInfo, billing: Billing) => billing === 'anual' ? Math.round(annualPrice(plan.key) / 12) : plan.monthly

export function BillingToggle({ billing, onChange }: { billing: Billing; onChange: (billing: Billing) => void }) {
  const group = useId()
  return <div className="calendar-mode plan-billing" role="group" aria-label="Cómo pagar">
    {(['mensual', 'anual'] as const).map(value => <button type="button" key={value} aria-pressed={billing === value} className={billing === value ? 'is-active' : ''} onClick={() => onChange(value)}>
      {billing === value && <SegmentIndicator group={group} />}
      {value === 'mensual' ? 'Mensual' : <>Anual <span className="plan-billing-save">{ANNUAL_FREE_MONTHS} meses gratis</span></>}
    </button>)}
  </div>
}

// trialGift: si mostrar en el Básico los días del Pro de regalo (no, si ese negocio ya usó la prueba)
export function PlanCards({ billing, current, action, trialGift = true }: { billing: Billing; current?: Plan | null; action: (plan: Plan) => PlanAction; trialGift?: boolean }) {
  return <div className="plan-cards">
    {PLAN_ORDER.map(key => <PlanCard key={key} plan={PLANS[key]} billing={billing} current={current === key} action={action(key)} trialGift={trialGift} />)}
  </div>
}

function PlanCard({ plan, billing, current, action, trialGift }: { plan: PlanInfo; billing: Billing; current: boolean; action: PlanAction; trialGift: boolean }) {
  const featured = plan.key === 'pro'
  const free = plan.monthly === 0
  const price = perMonth(plan, billing)
  const titleId = useId()
  // El Pro se vende contra el Básico: cuánto más sale por mes, con la misma forma de pago
  const extra = perMonth(PLANS.pro, billing) - perMonth(PLANS.basico, billing)
  return <article className={`plan-card plan-card--${plan.key}${featured ? ' plan-card--featured' : ''}${current ? ' is-current' : ''}`} aria-labelledby={titleId}>
    <div className="plan-card-head">
      <h3 id={titleId}>{plan.name}</h3>
      {current ? <span className="plan-tag plan-tag--current">Tu plan</span> : featured && <span className="plan-tag">Todo incluido</span>}
    </div>
    <p className="plan-tagline">{plan.tagline}</p>
    <div className="plan-price">
      {/* El precio cambia con la forma de pago: el viejo se va hacia arriba y el nuevo entra desde abajo */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.strong
          key={price}
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        >{free ? '$ 0' : formatPrice(price)}</motion.strong>
      </AnimatePresence>
      <span>{free ? 'para siempre' : 'por mes'}</span>
    </div>
    <p className="plan-price-note">
      {free ? 'Sin tarjeta'
        : billing === 'anual' ? <><s aria-label={`Antes ${formatPrice(plan.monthly)} por mes`}>{formatPrice(plan.monthly)}</s> · {formatPrice(annualPrice(plan.key))} por año</>
        : 'Se paga mes a mes, sin permanencia'}
    </p>
    <button type="button" className={`button button--full ${featured ? 'button--primary' : 'button--secondary'}`} disabled={action.disabled} onClick={action.onClick}>
      {action.label}{featured && !action.disabled && <ArrowRight size={16} aria-hidden="true" />}
    </button>
    {featured && <p className="plan-upsell">Por {formatPrice(extra)} más por mes que el Básico, tenés todo.</p>}
    {plan.key === 'basico' && trialGift && <p className="plan-upsell">Te regalamos {TRIAL_DAYS} días del Pro para que lo pruebes.</p>}
    <ul className="plan-list">
      {plan.highlights.map(item => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}
    </ul>
  </article>
}

// La promo del Pro semestral: 6 meses juntos con los 3 primeros a mitad de precio
export function ProSemesterOffer({ children }: { children: ReactNode }) {
  const full = PLANS.pro.monthly * PRO_SEMESTER.months
  const price = proSemesterPrice()
  return <div className="plan-offer">
    <div className="plan-offer-copy">
      <span className="plan-tag">Pro semestral · Te ahorrás {formatPrice(full - price)}</span>
      <strong className="plan-offer-title">Los {PRO_SEMESTER.halfPriceMonths} primeros meses a mitad de precio</strong>
      <p>Pagás los {PRO_SEMESTER.months} meses juntos y tenés todo el Pro desde el primer día.</p>
    </div>
    <div className="plan-offer-price">
      <strong>{formatPrice(price)}</strong>
      <span><s aria-label={`Antes ${formatPrice(full)}`}>{formatPrice(full)}</s> · {formatPrice(Math.round(price / PRO_SEMESTER.months))} por mes</span>
    </div>
    {children}
  </div>
}

export function PlanComparison({ current }: { current?: Plan | null }) {
  return <div className="plan-table-wrap">
    <table className="plan-table">
      <caption className="sr-only">Qué trae cada plan</caption>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Función</span></th>
          {PLAN_ORDER.map(key => <th scope="col" key={key} className={key === current ? 'is-current' : undefined}>{PLANS[key].name}</th>)}
        </tr>
      </thead>
      <tbody>
        {COMPARISON.map(row => <tr key={row.label}>
          <th scope="row">{row.label}</th>
          {PLAN_ORDER.map(key => {
            const value = row.values[key]
            return <td key={key} className={key === current ? 'is-current' : undefined}>
              {value === true ? <><Check size={16} aria-hidden="true" /><span className="sr-only">Incluido</span></>
                : value === false ? <><Minus size={16} aria-hidden="true" className="plan-table-no" /><span className="sr-only">No incluido</span></>
                : value}
            </td>
          })}
        </tr>)}
      </tbody>
    </table>
  </div>
}

// La sección de la portada
export function PricingSection({ onStart }: { onStart: () => void }) {
  const [billing, setBilling] = useState<Billing>('mensual')
  return <section id="precios" className="pricing-section" aria-labelledby="pricing-title">
    <Reveal>
      <h2 id="pricing-title">Empezá gratis.<br /><em>Crecé cuando quieras.</em></h2>
      {/* Todavía no hay cobro: todos arrancan en Gratis y los botones lo dicen (cuando llegue Mercado Pago, cada plan lleva a pagar) */}
      <p className="pricing-lead">Todos los negocios arrancan en el plan Gratis, sin tarjeta. El pago del Básico y del Pro se habilita muy pronto: vas a poder pasarte desde tu panel, y al pasarte al Básico te regalamos {TRIAL_DAYS} días del Pro.</p>
    </Reveal>
    <BillingToggle billing={billing} onChange={setBilling} />
    {/* Todos llevan a crear la cuenta (arranca en Gratis y el plan se elige después): los pagos dicen "Quiero…", no "gratis" */}
    <PlanCards billing={billing} action={plan => ({ label: plan === 'gratis' ? 'Empezar gratis' : `Quiero el ${PLANS[plan].name}`, onClick: onStart })} />
    <p className="pricing-note">Cualquier botón crea tu cuenta en el plan Gratis. El plan pago lo elegís después, desde tu panel.</p>
    <ProSemesterOffer><button type="button" className="button button--secondary" onClick={onStart}>Quiero el Pro semestral <ArrowRight size={16} aria-hidden="true" /></button></ProSemesterOffer>
    <details className="plan-compare">
      <summary>Comparar todo lo que trae cada plan</summary>
      <PlanComparison />
    </details>
  </section>
}
