// Qué puede usar cada negocio según su plan. Es el único lugar que lo decide: el resto del panel solo pregunta.
// Todavía no hay suscripciones (se definen al final, ver SESION_PENDIENTE.md): mientras tanto todos tienen el plan completo.
// Cuando existan, businessPlan lee el plan del negocio y la base también lo valida.

export type Plan = 'basico' | 'pro'
export type Feature = 'advanced-stats' // "Estadísticas": exclusiva del plan más alto (Pro)

// En desarrollo, ?plan=basico en la dirección muestra el panel como lo ve un negocio sin el plan Pro
const previewPlan: Plan | null = import.meta.env.DEV && new URLSearchParams(window.location.search).get('plan') === 'basico' ? 'basico' : null

export function businessPlan(): Plan {
  return previewPlan ?? 'pro'
}

export function hasFeature(context: { isOwner: boolean; plan: Plan }, feature: Feature): boolean {
  switch (feature) {
    case 'advanced-stats':
      // Un profesional con cuenta nunca ve estadísticas del negocio
      return context.isOwner && context.plan === 'pro'
  }
}
