// Qué se puede escribir en cada tipo de campo. Se aplica en cada cambio (onChange), así también se limpia
// lo que se pega. No reemplaza las validaciones de la base: solo evita que se escriba algo que no corresponde.

const collapseSpaces = (value: string) => value.replace(/\s{2,}/g, ' ').replace(/^\s+/, '')

// Nombres de personas: letras (con tildes, ñ y diéresis), espacios, apóstrofo, punto y guion.
// "María José", "D'Angelo", "Ana-Laura", "J. Pérez".
export function personName(value: string): string {
  return collapseSpaces(value.replace(/[^\p{L}\p{M}\s'.-]/gu, ''))
}

// Nombres de negocios y servicios: también números y algunos signos.
// "Barbería 23", "Corte + barba", "López & Hijos", "Uñas (semipermanente)".
export function freeText(value: string): string {
  return collapseSpaces(value.replace(/[^\p{L}\p{M}\p{N}\s'.,:&+()/-]/gu, ''))
}

// Direcciones: letras, números y la puntuación típica ("Av. Colón 1234, 2º B").
export function address(value: string): string {
  return collapseSpaces(value.replace(/[^\p{L}\p{M}\p{N}\s'.,#°º/-]/gu, ''))
}

// Teléfonos y WhatsApp: solo números y espacios, con un + opcional al principio ("+54 9 11 5555 0000").
export function phone(value: string): string {
  const digits = collapseSpaces(value.replace(/[^\d\s]/g, ''))
  return value.trimStart().startsWith('+') ? `+${digits}` : digits
}

// Emails: sin espacios.
export function email(value: string): string {
  return value.replace(/\s/g, '')
}

// Enlace del negocio: minúsculas, números y guiones; las tildes se quitan y los espacios pasan a guion.
export function slugText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-')
}

// Campos numéricos (duración, precio): los <input type="number"> aceptan "e", "+", "-" y ","; esto los bloquea.
export function digitsOnlyKeys(event: { key: string; preventDefault: () => void }) {
  if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault()
}
