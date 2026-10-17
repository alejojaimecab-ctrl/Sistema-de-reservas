// Rutas de la app sin librería de router: el primer segmento del path es el
// slug público de un negocio (reser.com/mi-negocio), salvo los reservados.

const RESERVED_SLUGS = new Set([
  'login', 'registro', 'panel', 'dashboard', 'admin', 'api', 'assets', 'brand',
  'demo', 'reservar', 'cancelar', 'app', 'www', 'ayuda', 'soporte', 'precios', 'terminos', 'privacidad',
])

export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Mensaje de error si el slug no sirve como enlace público; null si está bien.
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return 'El enlace tiene que tener al menos 3 caracteres.'
  if (slug.length > 40) return 'El enlace puede tener hasta 40 caracteres.'
  if (RESERVED_SLUGS.has(slug)) return 'Ese enlace está reservado, elegí otro.'
  return null
}

// '/mi-negocio' → 'mi-negocio'; '/' o rutas reservadas → null
export function slugFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first) return null
  let slug: string
  try { slug = decodeURIComponent(first).toLowerCase() } catch { return null }
  return RESERVED_SLUGS.has(slug) ? null : slug
}

// '/cancelar/<uuid>' → '<uuid>'; cualquier otra ruta → null
export function cancelTokenFromPath(pathname: string): string | null {
  const [first, token, ...rest] = pathname.split('/').filter(Boolean)
  const isUuid = !!token && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)
  return first === 'cancelar' && isUuid && rest.length === 0 ? token.toLowerCase() : null
}

export function cancelUrl(token: string): string {
  return `${window.location.origin}/cancelar/${token}`
}

export function bookingUrl(slug: string): string {
  return `${window.location.origin}/${slug}`
}

export function goTo(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
}
