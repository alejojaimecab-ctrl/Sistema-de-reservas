// Rutas de la app sin librería de router: el primer segmento del path es el
// slug público de un negocio (reser.com/mi-negocio), salvo los reservados.

const RESERVED_SLUGS = new Set([
  'login', 'registro', 'panel', 'dashboard', 'admin', 'api', 'assets', 'brand',
  'demo', 'reservar', 'cancelar', 'unirme', 'app', 'www', 'ayuda', 'soporte', 'precios', 'terminos', 'privacidad',
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

// '/<prefijo>/<uuid>' → '<uuid>'; cualquier otra ruta → null
function tokenFromPath(pathname: string, prefix: string): string | null {
  const [first, token, ...rest] = pathname.split('/').filter(Boolean)
  const isUuid = !!token && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)
  return first === prefix && isUuid && rest.length === 0 ? token.toLowerCase() : null
}

export function cancelTokenFromPath(pathname: string): string | null {
  return tokenFromPath(pathname, 'cancelar')
}

// '/unirme/<uuid>': invitación para que un profesional se sume al panel del negocio
export function joinTokenFromPath(pathname: string): string | null {
  return tokenFromPath(pathname, 'unirme')
}

export function joinUrl(token: string): string {
  return `${window.location.origin}/unirme/${token}`
}

// '/panel' → '' y '/panel/agenda' → 'agenda' (la sección del panel queda en la dirección: sobrevive al recargar
// y el botón Atrás vuelve a la sección anterior); cualquier otra ruta → null
export function panelSectionFromPath(pathname: string): string | null {
  const [first, section, ...rest] = pathname.split('/').filter(Boolean)
  if (first !== 'panel' || rest.length > 0) return null
  return section ?? ''
}

// '/terminos' o '/privacidad' → documento legal; cualquier otra ruta → null
export function legalDocFromPath(pathname: string): 'terminos' | 'privacidad' | null {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length === 1 && (parts[0] === 'terminos' || parts[0] === 'privacidad') ? parts[0] : null
}

export function cancelUrl(token: string): string {
  return `${window.location.origin}/cancelar/${token}`
}

export function bookingUrl(slug: string): string {
  return `${window.location.origin}/${slug}`
}

// Enlace a Google Maps con la dirección del negocio
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// tel: solo con dígitos y +, sin importar cómo lo escribió el dueño
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`
}

// Número para wa.me: solo dígitos y con código de país. Entiende cómo lo escribe un argentino:
// "11 5555 0000", "011 15 5555 0000", "+54 9 11 5555 0000". Devuelve null si no parece un número.
export function whatsappDigits(raw: string): string | null {
  let d = raw.replace(/[^0-9]/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    if (d.length === 12 && d[2] !== '9') d = `549${d.slice(2)}` // 54 11 5555 0000 → 54 9 11 5555 0000
    return d.length >= 12 ? d : null
  }
  d = d.replace(/^0+/, '')
  // El "15" de los celulares viejos va después del código de área (2, 3 o 4 dígitos).
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break }
    }
  }
  if (d.length === 10) return `549${d}`
  if (d.length === 11 && d.startsWith('9')) return `54${d}`
  return d.length >= 11 ? d : null
}

// Enlace de WhatsApp con un mensaje ya escrito
export function whatsappHref(raw: string, text: string): string | null {
  const digits = whatsappDigits(raw)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

export function goTo(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
}
