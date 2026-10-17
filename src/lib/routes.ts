// Rutas de la app sin librería de router: el primer segmento del path es el
// slug público de un negocio (reser.com/mi-negocio), salvo los reservados.

const RESERVED_SLUGS = new Set([
  'login', 'registro', 'panel', 'dashboard', 'admin', 'api', 'assets', 'brand',
  'demo', 'reservar', 'app', 'www', 'ayuda', 'soporte', 'precios', 'terminos', 'privacidad',
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

export function bookingUrl(slug: string): string {
  return `${window.location.origin}/${slug}`
}

export function goTo(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
}
