// Planes de RESER: qué trae cada uno, cuánto sale y qué plan vale ahora para un negocio.
// Es el único lugar que lo decide del lado de la app: la landing, el panel y los avisos solo preguntan.
// La base valida lo mismo (supabase/migrations/036_planes.sql): si cambiás un límite acá, cambialo también en private.plan_limits.
// Todavía no hay cobro: el plan lo cambia el servidor. Cada negocio nuevo arranca con TRIAL_DAYS días de Pro.

export type Plan = 'gratis' | 'basico' | 'pro'
export type Feature =
  | 'reminders' // recordatorio por mail 1 h antes
  | 'branding' // logo propio y página sin "Hecho con RESER"
  | 'staff-accounts' // cuentas para el equipo
  | 'advanced-stats' // Estadísticas, meta del mes y exportar
  | 'deposits' // señas con Mercado Pago (próximamente)
export type Billing = 'mensual' | 'anual'

export type PlanInfo = {
  key: Plan
  name: string
  tagline: string
  monthly: number // pesos por mes
  limits: { professionals: number | null; monthlyBookings: number | null } // null = sin límite
  features: Feature[]
  highlights: string[] // lo que se lista en la tarjeta del plan
}

export const TRIAL_DAYS = 14
export const ANNUAL_FREE_MONTHS = 3 // anual: pagás 9 meses y usás 12
export const PRO_SEMESTER = { months: 6, halfPriceMonths: 3 } // Pro semestral: los 3 primeros meses al 50%

export const PLAN_ORDER: Plan[] = ['gratis', 'basico', 'pro']

export const PLANS: Record<Plan, PlanInfo> = {
  gratis: {
    key: 'gratis',
    name: 'Gratis',
    tagline: 'Para empezar a recibir reservas',
    monthly: 0,
    limits: { professionals: 1, monthlyBookings: 30 },
    features: [],
    highlights: ['1 profesional', 'Hasta 30 turnos por mes', 'Tu página de reservas con enlace y QR', 'Mails de confirmación y cancelación'],
  },
  basico: {
    key: 'basico',
    name: 'Básico',
    tagline: 'Para el negocio que ya camina',
    monthly: 14900,
    limits: { professionals: 3, monthlyBookings: null },
    features: ['reminders', 'branding', 'staff-accounts'],
    highlights: ['Hasta 3 profesionales', 'Turnos sin límite', 'Recordatorio por mail 1 h antes', 'Tu logo, sin la marca RESER', 'Cuentas para tu equipo'],
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    tagline: 'Para hacer crecer tu negocio',
    monthly: 19900,
    limits: { professionals: null, monthlyBookings: null },
    features: ['reminders', 'branding', 'staff-accounts', 'advanced-stats', 'deposits'],
    highlights: ['Profesionales sin límite', 'Todo lo del Básico', 'Estadísticas de ganancias, ocupación y clientes', 'Meta del mes y exportar a Excel o PDF', 'Señas con Mercado Pago (próximamente)'],
  },
}

// La comparación lado a lado (landing y "Tu plan"). true/false: lo trae o no; un texto: cuánto o cuándo.
export const COMPARISON: { label: string; values: Record<Plan, boolean | string> }[] = [
  { label: 'Profesionales', values: { gratis: '1', basico: 'Hasta 3', pro: 'Sin límite' } },
  { label: 'Turnos por mes', values: { gratis: '30', basico: 'Sin límite', pro: 'Sin límite' } },
  { label: 'Página de reservas, enlace y QR', values: { gratis: true, basico: true, pro: true } },
  { label: 'Mails de confirmación y cancelación', values: { gratis: true, basico: true, pro: true } },
  { label: 'Recordatorio por mail 1 h antes', values: { gratis: false, basico: true, pro: true } },
  { label: 'Tu logo, sin la marca RESER', values: { gratis: false, basico: true, pro: true } },
  { label: 'Cuentas para tu equipo', values: { gratis: false, basico: true, pro: true } },
  { label: 'Estadísticas, meta del mes y exportar', values: { gratis: false, basico: false, pro: true } },
  { label: 'Señas con Mercado Pago', values: { gratis: false, basico: false, pro: 'Próximamente' } },
]

// ── Precios con promoción ──
export const annualPrice = (plan: Plan) => PLANS[plan].monthly * (12 - ANNUAL_FREE_MONTHS)
export const proSemesterPrice = () => {
  const monthly = PLANS.pro.monthly
  return monthly * PRO_SEMESTER.halfPriceMonths / 2 + monthly * (PRO_SEMESTER.months - PRO_SEMESTER.halfPriceMonths)
}

// ── El plan que vale ahora para un negocio ──
type PlanFields = { plan: Plan; trial_ends_at: string | null }
const DAY = 24 * 60 * 60 * 1000

// En desarrollo, ?plan=gratis|basico|pro muestra el panel con ese plan y ?prueba=5 simula 5 días de prueba restantes
const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const devPlan = PLAN_ORDER.find(plan => plan === devParams?.get('plan')) ?? null
const devTrialDays = devParams?.has('prueba') ? Number(devParams.get('prueba')) : null

export function trialEndsAt(business: PlanFields | null): Date | null {
  if (devTrialDays !== null && Number.isFinite(devTrialDays)) return new Date(Date.now() + devTrialDays * DAY - 60_000)
  if (devPlan || !business?.trial_ends_at) return null
  const end = new Date(business.trial_ends_at)
  return end.getTime() > Date.now() ? end : null
}

export function trialDaysLeft(business: PlanFields | null): number | null {
  const end = trialEndsAt(business)
  return end ? Math.max(1, Math.ceil((end.getTime() - Date.now()) / DAY)) : null
}

// El contratado (sin contar la prueba)
export function contractedPlan(business: PlanFields | null): Plan {
  return devPlan ?? business?.plan ?? 'gratis'
}

export function effectivePlan(business: PlanFields | null): Plan {
  return trialEndsAt(business) ? 'pro' : contractedPlan(business)
}

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature)
}

// Los profesionales que reciben turnos: los primeros N activos por orden de alta (la base decide igual, ver resource_in_plan)
export function professionalsInPlan(professionals: { id: string; is_active: boolean }[], limit: number | null): Set<string> {
  const active = professionals.filter(p => p.is_active)
  return new Set((limit === null ? active : active.slice(0, limit)).map(p => p.id))
}
